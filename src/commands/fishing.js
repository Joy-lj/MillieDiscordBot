import {
  ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,MessageFlags,StringSelectMenuBuilder,
} from "discord.js";
import { fishing } from "../database/fishing.js";
import { FishingError } from "../../services/fishingStore.js";
import { economyConfig } from "../config/economy.js";

const quiet={parse:[],repliedUser:false};
const money=(n)=>`${n.toLocaleString("en-US")} ${economyConfig.currencyName}`;
const cid=(owner,action,target="-",page=0)=>`fish:${owner}:${action}:${target}:${page}`;
const btn=(owner,label,action,target="-",page=0,style=ButtonStyle.Secondary,disabled=false)=>
  new ButtonBuilder().setCustomId(cid(owner,action,target,page)).setLabel(label).setStyle(style).setDisabled(disabled);
const row=(...items)=>new ActionRowBuilder().addComponents(items);
const panel=(embed,components=[])=>({embeds:[embed],components,allowedMentions:quiet});

function castView(guild, user, requestId) {
  const result = fishing.cast(guild, user, requestId);
  const time = Math.ceil(result.nextCastAt / 1000);

  if (!result.caught) {
    let birdNotice = "";
    
    // Check if user has a bird pet to show a custom cooldown reduction message
    const pet = db.prepare(`
      SELECT pet_type, stage FROM pets WHERE guild_id = ? AND user_id = ?
    `).get(guild, user);

    if (pet && pet.pet_type === "bird") {
      if (pet.stage === 2) {
        birdNotice = "\n*(🐦 Stage 2 Bird reduced your fishing cooldown by 30 seconds!)*";
      } else if (pet.stage === 3) {
        birdNotice = "\n*(🐦 Max Stage Bird reduced your fishing cooldown by a full minute!)*";
      }
    }

    return panel(
      new EmbedBuilder()
        .setTitle("🎣 Let the water settle")
        .setColor(0x7f8c8d)
        .setDescription(`You can fish again <t:${time}:R>.\nYour fish are waiting in \`!fishbag\`.${birdNotice}`),
      [row(btn(user, "Cast again", "cast"), btn(user, "Fish bag", "bag"))]
    );
  }

  const fish = result.fish;
  const embed = new EmbedBuilder()
    .setTitle(`${fish.emoji} You caught a ${fish.name}!`)
    .setColor({ Common: 0x95a5a6, Uncommon: 0x2ecc71, Rare: 0x3498db, Epic: 0x9b59b6, Legendary: 0xf1c40f, Mythic: 0xe74c3c }[fish.rarity] ?? 0x3498db)
    .setDescription(
      `Rarity: **${fish.rarity}**\nSale value: **${money(fish.sellValue)}**\n\n` +
      `Added to your fish bag. Sell it to receive currency.\nNext cast: <t:${time}:R>.`
    )
    .setFooter({ text: "One fish per cast • Catching is free • Cooldown is saved across restarts" });

  return panel(embed, [
    row(
      btn(user, "Cast again", "cast"),
      btn(user, "Fish bag", "bag"),
      btn(user, `Sell 1 · ${fish.sellValue.toLocaleString("en-US")}`, "sellone", result.itemKey, 0, ButtonStyle.Success)
    ),
  ]);
}

function bagView(guild,user,page=0) {
  const bag=fishing.bag(guild,user,page);
  const embed=new EmbedBuilder().setTitle("🧺 Your Fish Bag").setColor(0x3498db)
    .setDescription(bag.totalFish?bag.entries.map(item=>
      `${item.fish.emoji} **${item.fish.name}** × ${item.quantity.toLocaleString("en-US")}\n`+
      `${item.fish.rarity} • ${money(item.fish.sellValue)} each`).join("\n\n"):
      "Your bag is empty. Use `!fish` to cast your line!")
    .addFields({name:"Total fish",value:bag.totalFish.toLocaleString("en-US"),inline:true},
      {name:"Whole bag value",value:money(bag.totalValue),inline:true})
    .setFooter({text:`Page ${bag.page+1}/${bag.pages} • Fish retain the sale price they had when caught`});
  const components=[];
  if(bag.entries.length) components.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(cid(user,"pick","-",bag.page))
      .setPlaceholder("Select a fish stack to sell")
      .addOptions(bag.entries.map(item=>({label:`${item.fish.name} × ${item.quantity}`.slice(0,100),
        description:`${item.fish.rarity} • ${money(item.fish.sellValue)} each`.slice(0,100),value:item.itemKey})))
  ));
  components.push(row(
    btn(user,"Previous","bag","-",bag.page-1,ButtonStyle.Secondary,bag.page===0),
    btn(user,"Next","bag","-",bag.page+1,ButtonStyle.Secondary,bag.page===bag.pages-1),
    btn(user,"Refresh","bag","-",bag.page),btn(user,"Cast again","cast"),
    btn(user,"Sell whole bag","sellbag","-",0,ButtonStyle.Success,bag.totalFish===0),
  ));
  return panel(embed,components);
}

function stackView(guild,user,key,page=0) {
  const item=fishing.entry(guild,user,key),fish=item.fish;
  return panel(new EmbedBuilder().setTitle(`${fish.emoji} ${fish.name}`).setColor(0x3498db)
    .setDescription(`Rarity: **${fish.rarity}**\nOwned: **${item.quantity.toLocaleString("en-US")}**\n`+
      `Each sells for **${money(fish.sellValue)}**.\nStack value: **${money(item.quantity*fish.sellValue)}**.`),
    [row(btn(user,`Sell 1 · ${fish.sellValue.toLocaleString("en-US")}`,"sellone",key,0,ButtonStyle.Success),
      btn(user,"Sell this stack","sellstack",key,0,ButtonStyle.Success),btn(user,"Back to bag","bag","-",page))]);
}

function saleView(user,receipt) {
  return panel(new EmbedBuilder().setTitle("💰 Fish Sold").setColor(0x2ecc71)
    .setDescription(`Sold **${receipt.sold.toLocaleString("en-US")} fish** for **${money(receipt.earned)}**.\n`+
      `${economyConfig.currencyEmoji} Balance: **${money(receipt.balance)}**.`),
    [row(btn(user,"Fish bag","bag"),btn(user,"Cast again","cast"))]);
}

async function command(message,fn) {
  if(!message.inGuild() || message.author.bot)return;
  let data;
  try{data=fn();}catch(error){
    console.error("Fishing command failed:",error);
    data={content:error instanceof FishingError?error.message:"Fishing could not complete. Check the bot log.",allowedMentions:quiet};
  }
  // A failed reply never retries the database mutation or generates another catch.
  await message.reply(data).catch(console.error);
}
export async function fishCommand(message) {
  await command(message,()=>castView(message.guildId,message.author.id,message.id));
}
export async function fishBagCommand(message) {
  await command(message,()=>bagView(message.guildId,message.author.id));
}

export async function handleFishingInteraction(interaction) {
  if(!interaction.isMessageComponent() || !interaction.customId.startsWith("fish:"))return false;
  const [,owner,action,target,pageText]=interaction.customId.split(":");
  if(!interaction.inGuild() || interaction.user.id!==owner){
    await interaction.reply({content:"These fishing controls belong to another player. Use !fish or !fishbag.",flags:MessageFlags.Ephemeral});
    return true;
  }
  const page=/^-?\d+$/.test(pageText??"")?Number(pageText):0;
  if(!Number.isSafeInteger(page) || Math.abs(page)>1_000_000){
    await interaction.reply({content:"Refresh !fishbag to get new controls.",flags:MessageFlags.Ephemeral});return true;
  }
  const navigation=["bag","pick"].includes(action);
  if(navigation)await interaction.deferUpdate();
  else await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const guild=interaction.guildId,user=interaction.user.id;
  let data;
  try {
    if(action==="bag")data=bagView(guild,user,page);
    else if(action==="pick" && interaction.isStringSelectMenu())data=stackView(guild,user,interaction.values[0],page);
    else if(action==="cast")data=castView(guild,user,interaction.id);
    else if(action==="sellone")data=saleView(user,fishing.sell(guild,user,interaction.id,target,1));
    else if(action==="sellstack")data=saleView(user,fishing.sell(guild,user,interaction.id,target,"all"));
    else if(action==="sellbag")data=saleView(user,fishing.sell(guild,user,interaction.id));
    else throw new FishingError("Unknown fishing control. Refresh !fishbag.");
  } catch(error) {
    console.error("Fishing interaction failed:",error);
    data={content:error instanceof FishingError?error.message:"The fishing action failed. Check the bot log.",embeds:[],components:[],allowedMentions:quiet};
  }
  await interaction.editReply(data).catch(console.error);
  return true;
}
