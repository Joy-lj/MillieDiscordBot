import { applyItemUpgrade } from "../../services/itemUpgrades.js";
import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, MessageFlags, StringSelectMenuBuilder,
} from "discord.js";
import {
  getUserInventory, getUserCombatStats, equipItemBySerial,
  unequipItemBySerial, setItemLocked, previewItemSale, confirmItemSale, ITEMS,
} from "../database/items.js";
import { economyConfig } from "../config/economy.js";
import { renderEquipment, EQUIPMENT_LABELS } from "../../services/equipmentArtwork.js";

import { renderInventoryPage, renderInventoryIcon } from "../../services/inventoryArtwork.js";

const quiet = { parse: [], repliedUser: false };
const PAGE_SIZE = 10, COPY_PAGE_SIZE = 25;
const clean = (v, max = 70) => String(v ?? "").replace(/[`*_~|<>]/g, "").replace(/\s+/g," ").trim().slice(0,max);
const num = (v) => Number(v ?? 0).toLocaleString("en-US");
const row = (...parts) => new ActionRowBuilder().addComponents(parts);
const known = (id) => Object.hasOwn(ITEMS,id) ? ITEMS[id] : null;
const buttonsError = {
  invalid_item: "That item's definition is no longer available.",
  not_owned: "You no longer own that copy. Press Refresh.",
  invalid_type: "That item has no valid equipment slot.",
  two_handed_equipped: "Unequip your two-handed main weapon before equipping an off-hand item.",
  not_equipped: "That copy is no longer equipped. Press Refresh.",
  nothing_equipped: "That slot is already empty.",
};

function groupsFor(inventory, slotFilter = null) {
  const groups = new Map();
  for (const copy of inventory) {
    const item = known(copy.item_id);
    if (slotFilter && item?.slot !== slotFilter) continue;
    if (!groups.has(copy.item_id)) groups.set(copy.item_id,{id:copy.item_id,item,copies:[]});
    groups.get(copy.item_id).copies.push(copy);
  }
  for (const group of groups.values()) group.copies.sort((a,b)=>Number(a.serial_number)-Number(b.serial_number));
  return [...groups.values()].sort((a,b)=>(a.item?.name??a.id).localeCompare(b.item?.name??b.id));
}

function bonuses(stats = {}) {
  return `⚔️ ${num(stats.attack)} ATK • 🛡️ ${num(stats.defense)} DEF • ❤️ ${num(stats.health)} HP\n` +
    `💨 ${num(stats.speed)} SPD • 🎯 ${num(Number((Number(stats.critChance??0)*100).toFixed(2)))}% CRIT`;
}

const MANAGER_CATEGORIES = {
  all: "All Equipment", weapon: "Weapons", armor: "Armor", accessory: "Accessories",
};

function managerGroups(state) {
  return groupsFor(state.inventory, state.slotFilter).filter(group =>
    group.item && Object.hasOwn(EQUIPMENT_LABELS, group.item.slot) &&
    (state.category === "all" || group.item.type === state.category)
  );
}

function managerSelection(state) {
  const groups = managerGroups(state);
  const pages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  state.managerPage = Math.max(0, Math.min(state.managerPage, pages - 1));
  let group = groups.find(group => group.id === state.itemId);
  if (group) state.managerPage = Math.floor(groups.indexOf(group) / PAGE_SIZE);
  else group = groups[state.managerPage * PAGE_SIZE];
  if (!group) { state.itemId = null; state.copyId = null; return {groups, pages, shown: []}; }
  if (state.itemId !== group.id) state.copyId = null;
  state.itemId = group.id;
  let copy = group.copies.find(copy => String(copy.id) === state.copyId);
  copy ??= group.copies.find(copy => state.equippedIds.has(String(copy.id))) ?? group.copies[0];
  state.copyId = String(copy.id);
  state.copyPage = Math.floor(group.copies.indexOf(copy) / COPY_PAGE_SIZE);
  return {groups, pages, group, copy,
    shown: groups.slice(state.managerPage * PAGE_SIZE, (state.managerPage + 1) * PAGE_SIZE)};
}

function equipmentComparison(equipment, item, instanceId) {
  const current = equipment[item.slot];
  const alreadyEquipped = String(current?.instanceId) === String(instanceId);
  const removed = new Map();
  if (current) removed.set(String(current.instanceId), current);
  const extraOffHand = !alreadyEquipped && item.slot === "main_hand" && item.handedness === 2
    ? equipment.off_hand : null;
  if (extraOffHand) removed.set(String(extraOffHand.instanceId), extraOffHand);
  const delta = {};
  for (const key of ["attack", "defense", "health", "speed", "critChance"]) {
    const oldValue = [...removed.values()].reduce((total, entry) => total + Number(entry.item.stats?.[key] ?? 0), 0);
    delta[key] = Number((Number(item.stats?.[key] ?? 0) - oldValue).toFixed(8));
  }
  const blocked = item.slot === "off_hand" && equipment.main_hand?.item.handedness === 2;
  return {current, alreadyEquipped, extraOffHand, delta, blocked};
}

function deltaText(delta) {
  const parts = [];
  for (const [key, label] of [["attack","ATK"],["defense","DEF"],["health","HP"],["speed","SPD"],["critChance","pp CRIT"]]) {
    const value = key === "critChance" ? Number((delta[key] * 100).toFixed(2)) : delta[key];
    if (value) parts.push(`${value > 0 ? "+" : ""}${num(value)} ${label}`);
  }
  return parts.join(" • ") || "No numerical stat change.";
}

async function managerView(state, prefix, username, expired) {
  const selection = managerSelection(state);
  const {group, copy, shown, pages} = selection;
  const embed = new EmbedBuilder().setColor(0x92805b).setTitle(`⚔️ ${clean(username)}'s Equipment Manager`);
  const controls = [], files = [];
  const btn = (action,label,disabled=false,style=ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(`${prefix}:${action}`).setLabel(label).setStyle(style).setDisabled(expired || disabled);
  controls.push(row(new StringSelectMenuBuilder().setCustomId(`${prefix}:category`)
    .setPlaceholder("Equipment category").setDisabled(expired)
    .addOptions(Object.entries(MANAGER_CATEGORIES).map(([value,label]) => ({label,value,default:value === state.category})))));
  if (!group) {
    embed.setDescription("No owned equipment in this category. Browse !shop or choose another category.");
    controls.push(row(btn("loadout","View Loadout"),btn("bag","Bag"),btn("manager","Equip manager"),btn("refresh","Refresh")));
  } else {
    const item = applyItemUpgrade(group.item, copy.upgrade_level ?? 0);
    const comparison = equipmentComparison(state.stats.equipment ?? {}, item, copy.id);
    const rarity = item.dungeon?.rarity ?? "common";
    embed.setTitle(clean(item.name))
      .setDescription(`${EQUIPMENT_LABELS[item.slot]} • ${item.handedness === 2 ? "Two-handed" : clean(item.type)} • ` +
        `Owned: **${group.copies.length}**\n` +
        (comparison.alreadyEquipped ? "✅ Equipped" : `Selected copy #${copy.serial_number}`) +
        (state.notice ? `\n\n${clean(state.notice,350)}` : ""))
      .addFields(
        {name:"Rarity",value:clean(rarity.replace(/_/g," "))},
        {name:"Item bonuses",value:bonuses(item.stats)},
        {name:"Replaces",value:comparison.current ? `${clean(comparison.current.item.name)} #${comparison.current.serialNumber}` : "Empty slot"},
        {name:"Change to gear bonuses",value:deltaText(comparison.delta)}
      );
    if (comparison.extraOffHand) embed.addFields({name:"Also unequips",value:
      `${clean(comparison.extraOffHand.item.name)} #${comparison.extraOffHand.serialNumber} — returned to your bag. Its bonuses are included in the comparison.`});
    if (comparison.blocked) embed.addFields({name:"Off-hand blocked",value:"Unequip your two-handed main weapon before equipping this item."});
    const effect = item.dungeon?.ability ?? item.dungeon?.passive;
    if (effect) embed.addFields({name:item.dungeon?.ability ? "Ability" : "Passive",value:clean(effect.name)});
    let icon;try { icon = await renderInventoryIcon(group.id, item?.dungeon?.rarity ?? "common"); } catch(error) {console.error("Equipment thumbnail unavailable:",error.message);}
    if(icon){files.push(new AttachmentBuilder(icon,{name:"item.png"}));embed.setThumbnail("attachment://item.png");}
    controls.push(row(new StringSelectMenuBuilder().setCustomId(`${prefix}:manageritem`)
      .setPlaceholder("Choose owned equipment").setDisabled(expired)
      .addOptions(shown.map(entry=>({label:`${entry.item.name} ×${entry.copies.length}`.slice(0,100),value:entry.id,
        description:(EQUIPMENT_LABELS[entry.item.slot] + (entry.copies.some(copy=>state.equippedIds.has(String(copy.id))) ? " • Equipped" : "")).slice(0,100),
        default:entry.id===group.id})))));
    controls.push(row(
      btn(`equip:${copy.id}`,comparison.alreadyEquipped ? "Equipped" : "Equip",comparison.alreadyEquipped || comparison.blocked,ButtonStyle.Success),
      btn(`unequip:${item.slot}:${copy.id}`,"Unequip",!comparison.alreadyEquipped,ButtonStyle.Danger),
      btn("togglecopies",state.showCopies ? "Hide copies" : "Choose copy",group.copies.length<2),
      btn("loadout","View Loadout"),btn("refresh","Refresh")
    ));
    if(state.showCopies && group.copies.length>1) {
      const visible=group.copies.slice(state.copyPage*COPY_PAGE_SIZE,(state.copyPage+1)*COPY_PAGE_SIZE);
      controls.push(row(new StringSelectMenuBuilder().setCustomId(`${prefix}:copy`).setPlaceholder("Choose a particular copy")
        .setDisabled(expired).addOptions(visible.map(entry=>({label:`Copy #${entry.serial_number}${entry.upgrade_level ? ` +${entry.upgrade_level}` : ""}${state.equippedIds.has(String(entry.id)) ? " • Equipped" : ""}`,
          value:String(entry.id),default:String(entry.id)===state.copyId})))));
    }
    const pagination=[];
    if(pages>1)pagination.push(btn("managerprevious","Previous items",state.managerPage===0),btn("managernext","Next items",state.managerPage===pages-1));
    const copyPages=Math.ceil(group.copies.length/COPY_PAGE_SIZE);
    if(state.showCopies && copyPages>1)pagination.push(btn("copiesprevious","Previous copies",state.copyPage===0),btn("copiesnext","Next copies",state.copyPage===copyPages-1));
    if(pagination.length)controls.push(row(...pagination));
  }
  embed.setFooter({text:expired ? "Controls expired • Use !equip to reopen" :
    `${MANAGER_CATEGORIES[state.category]} • Page ${state.managerPage+1}/${pages}` +
    (state.slotFilter ? ` • ${EQUIPMENT_LABELS[state.slotFilter]}` : "") +
    " • Crit changes are percentage points"});
  return {content:null,embeds:[embed],components:controls,files,attachments:[],allowedMentions:quiet};
}

const BAG_CATEGORIES = {
  all: "All Items", weapon: "Weapons", armor: "Armor", accessory: "Accessories", material: "Materials", consumable: "Supplies",
  dungeon: "Dungeon Drops", locked: "Favorites", equipped: "Equipped",
};
const BAG_SORTS = { name: "Name (A–Z)", rarity: "Rarity (highest)", value: "Value (highest)", newest: "Newest acquired" };
const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
const saleValue = item => Number.isSafeInteger(item?.price) && item.price > 0 && item.sellable !== false ? Math.floor(item.price * 0.5) : 0;

function bagGroups(state) {
  const groups = groupsFor(state.inventory).filter(group => {
    if (state.bagCategory === "all") return true;
    if (state.bagCategory === "dungeon") return group.item?.source === "dungeon";
    if (state.bagCategory === "locked") return group.copies.some(copy => copy.is_locked);
    if (state.bagCategory === "equipped") return group.copies.some(copy => state.equippedIds.has(String(copy.id)));
    return group.item?.type === state.bagCategory;
  });
  const score = group => state.bagSort === "rarity" ? RARITY_ORDER[group.item?.dungeon?.rarity] ?? -1
    : state.bagSort === "value" ? saleValue(group.item)
    : group.copies.reduce((max, copy) => Math.max(max, Number(copy.id)), 0);
  if (state.bagSort !== "name") groups.sort((a,b) => score(b)-score(a) || (a.item?.name??a.id).localeCompare(b.item?.name??b.id));
  return groups;
}

function collectionProgress(inventory) {
  const configured = Object.keys(ITEMS).filter(id => ["weapon","armor","accessory"].includes(ITEMS[id]?.type) && Object.hasOwn(EQUIPMENT_LABELS, ITEMS[id]?.slot));
  const owned = new Set(inventory.map(copy => copy.item_id));
  return { collected: configured.filter(id => owned.has(id)).length, total: configured.length };
}

async function backpackView(state, prefix, username, expired) {
  const groups = bagGroups(state);
  const pages = Math.max(1,Math.ceil(groups.length/PAGE_SIZE));
  state.page = Math.max(0,Math.min(state.page,pages-1));
  const shown = groups.slice(state.page*PAGE_SIZE,(state.page+1)*PAGE_SIZE);
  const progress = collectionProgress(state.inventory);
  const embed = new EmbedBuilder().setColor(0x00ae86).setTitle(`🎒 ${clean(username)}'s Inventory`);
  const lines = shown.map(group => {
    const locked = group.copies.filter(copy=>copy.is_locked).length;
    const equipped = group.copies.filter(copy=>state.equippedIds.has(String(copy.id))).length;
    return `**${clean(group.item?.name??group.id)}** ×${num(group.copies.length)} • ${clean(group.item?.dungeon?.rarity??"unknown")}` +
      (equipped ? ` • ✅ ${equipped}` : "") + (locked ? ` • 🔒 ${locked}` : "");
  });
  const files=[];
  let pageImage;
  if(shown.length){
    try { pageImage=await renderInventoryPage(shown,state.equippedIds); }
    catch(error){console.error("Inventory page artwork unavailable:",error.message);}
  }
  if(pageImage){
    files.push(new AttachmentBuilder(pageImage,{name:"inventory.png",description:lines.join("; ").slice(0,1000)}));
    embed.setImage("attachment://inventory.png");
  }
  embed.setDescription(`${economyConfig.currencyEmoji??"💰"} **${num(state.stats.balance)} ${clean(economyConfig.currencyName)}**\n`+
    `Collection: **${progress.collected}/${progress.total}** equipment types currently owned\n\n`+
    (pageImage?"Choose an item below to equip, lock or sell.":lines.join("\n")||"No items in this category. Visit !shop or choose another filter.")+
    (state.notice?`\n\n${clean(state.notice,350)}`:""));
  const btn=(action,label,disabled=false,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId(`${prefix}:${action}`)
    .setLabel(label).setStyle(style).setDisabled(expired||disabled);
  const controls=[
    row(new StringSelectMenuBuilder().setCustomId(`${prefix}:bagcategory`).setPlaceholder("Inventory category").setDisabled(expired)
      .addOptions(Object.entries(BAG_CATEGORIES).map(([value,label])=>({label,value,default:value===state.bagCategory})))),
    row(new StringSelectMenuBuilder().setCustomId(`${prefix}:bagsort`).setPlaceholder("Sort items").setDisabled(expired)
      .addOptions(Object.entries(BAG_SORTS).map(([value,label])=>({label,value,default:value===state.bagSort})))),
  ];
  if(shown.length)controls.push(row(new StringSelectMenuBuilder().setCustomId(`${prefix}:item`).setPlaceholder("View an item • Equip or sell")
    .setDisabled(expired).addOptions(shown.map(group=>({label:`${group.item?.name??group.id} ×${group.copies.length}`.slice(0,100),value:group.id,
      description:`${group.item?.type??"Unknown"} • ${num(saleValue(group.item))} sell value each`.slice(0,100)})))));
  const hasDuplicates=groupsFor(state.inventory).some(group=>group.copies.length>1 && saleValue(group.item)>0 &&
    group.copies.some(copy=>!copy.is_locked&&!state.equippedIds.has(String(copy.id))));
  controls.push(row(btn("previous","Previous",state.page===0),btn("next","Next",state.page===pages-1),
    btn("loadout","Loadout"),btn("previewduplicates","Sell duplicates",!hasDuplicates,ButtonStyle.Danger),btn("refresh","Refresh")));
  embed.setFooter({text:expired?"Controls expired • Use !inventory to reopen":`${state.inventory.length} owned copies • ${groups.length} visible types • Page ${state.page+1}/${pages}`});
  return {content:null,embeds:[embed],components:controls,files,attachments:[],allowedMentions:quiet};
}

function salePreviewView(state,prefix,expired) {
  const sale=state.sale;
  if(!sale)throw new Error("Sale preview is no longer available.");
  const grouped=new Map();
  for(const item of sale.items){
    if(!grouped.has(item.itemId))grouped.set(item.itemId,{name:item.name,count:0});
    grouped.get(item.itemId).count++;
  }
  const groups=[...grouped.values()];
  const embed=new EmbedBuilder().setColor(0xe67e22).setTitle(sale.mode==="duplicates"?"💰 Sell Duplicate Gear?":"💰 Sell This Copy?")
    .setDescription(`Sell **${num(sale.count)} copies** for **${num(sale.total)} ${clean(economyConfig.currencyName)}**?\n\n`+
      groups.slice(0,10).map(item=>`• ${clean(item.name)} ×${item.count}`).join("\n")+
      (groups.length>10?`\n…and ${groups.length-10} more item types`:"")+"\n\n"+
      (sale.mode==="duplicates"?"Applies to your entire backpack, across all filters. Keeps at least one copy of each item type; equipped and locked copies are protected.\n":"Equipped and locked copies cannot be sold here.\n")+
      `Confirm before <t:${Math.ceil(sale.expiresAt/1000)}:R>.`);
  const btn=(action,label,style)=>new ButtonBuilder().setCustomId(`${prefix}:${action}:${sale.token}`).setLabel(label).setStyle(style).setDisabled(expired);
  return {content:null,embeds:[embed],components:[row(btn("saleconfirm","Confirm sale",ButtonStyle.Danger),btn("salecancel","Cancel",ButtonStyle.Secondary))],files:[],attachments:[],allowedMentions:quiet};
}

async function refreshState(state, guild, user) {
  const [inventory,stats] = await Promise.all([getUserInventory(guild,user),getUserCombatStats(guild,user)]);
  state.inventory=inventory; state.stats=stats; state.board=null;
  state.equippedIds=new Set((stats.equippedInstanceIds??[]).map(String));
  const group=groupsFor(inventory).find(g=>g.id===state.itemId);
  if (state.view==="item" && !group) {state.view="bag";state.page=0;state.copyId=null;}
  if(group && !group.copies.some(c=>String(c.id)===state.copyId)) {
    const copy=group.copies.find(c=>!state.equippedIds.has(String(c.id)))??group.copies[0];
    state.copyId=String(copy.id);
  }
}

async function panel(state,prefix,username,expired=false) {
  if(state.view === "manager") return managerView(state,prefix,username,expired);
  if(state.view === "bag") return backpackView(state,prefix,username,expired);
  if(state.view === "sale") return salePreviewView(state,prefix,expired);
  const embed=new EmbedBuilder().setColor(0x92805b).setTitle(`🎒 ${clean(username)}'s Equipment`);
  const controls=[],files=[];
  const btn=(action,label,disabled=false,style=ButtonStyle.Secondary)=>new ButtonBuilder()
    .setCustomId(`${prefix}:${action}`).setLabel(label).setStyle(style).setDisabled(expired||disabled);
  const money=`${economyConfig.currencyEmoji??"💰"} **${num(state.stats.balance)} ${clean(economyConfig.currencyName)}**`;
  const notice=state.notice?`\n\n${clean(state.notice,350)}`:"";
  let pageCount=1;

  if(state.view==="loadout") {
    const slot=state.selectedSlot;
    const equipped=state.stats.equipment?.[slot];
    const blocked=slot==="off_hand"&&state.stats.equipment?.main_hand?.item.handedness===2;
    embed.setDescription(`${money}\n${bonuses(state.stats)}\n\n`+
      `**${EQUIPMENT_LABELS[slot]}:** `+
      (equipped?`${clean(equipped.item.name)} #${equipped.serialNumber}`:blocked?"Blocked by your two-handed weapon":"Empty")+notice);
    if(!state.board) state.board=await renderEquipment(state.stats.equipment,state.selectedSlot);
    files.push(new AttachmentBuilder(state.board,{name:"loadout.png"}));
    embed.setImage("attachment://loadout.png");
    controls.push(row(new StringSelectMenuBuilder().setCustomId(`${prefix}:slot`)
      .setPlaceholder("Select an equipment slot").setDisabled(expired)
      .addOptions(Object.entries(EQUIPMENT_LABELS).map(([key,label])=>({
        label,value:key,default:key===slot,
        description:(state.stats.equipment?.[key]
          ?`${state.stats.equipment[key].item.name} #${state.stats.equipment[key].serialNumber}`:"Empty").slice(0,100),
      })))));
    controls.push(row(
      btn("choose","Choose gear",false,ButtonStyle.Success),
      btn(`unequip:${slot}:${equipped?.instanceId??"-"}`,"Unequip",!equipped,ButtonStyle.Danger),
      btn("bag","Bag"),btn("refresh","Refresh")
    ));
  } else {
    const group=groupsFor(state.inventory).find(g=>g.id===state.itemId);
    if(!group)throw new Error("Selected item is no longer owned.");
    const copy=group.copies.find(c=>String(c.id)===state.copyId)??group.copies[0];
    state.copyId=String(copy.id);
    pageCount=Math.max(1,Math.ceil(group.copies.length/COPY_PAGE_SIZE));
    state.copyPage=Math.floor(group.copies.indexOf(copy)/COPY_PAGE_SIZE);
    const shown=group.copies.slice(state.copyPage*COPY_PAGE_SIZE,(state.copyPage+1)*COPY_PAGE_SIZE);
    const isEquipped=state.equippedIds.has(String(copy.id));
    const item=applyItemUpgrade(group.item, copy.upgrade_level ?? 0);
    embed.setTitle(clean(item?.name??group.id))
      .setDescription(`Owned: **${group.copies.length}** • ${isEquipped?"✅ Equipped":"In your bag"}\n\n`+
        (item ? ["material", "consumable"].includes(item.type)
          ? `${item.type === "consumable" ? "Supply" : "Material"} • Inventory only\n\n${clean(item.description,350)}${item.use ? `\n${clean(item.use,200)}` : ""}`
          : `${clean(item.type)} • ${EQUIPMENT_LABELS[item.slot]??"Unassigned"}${item.handedness===2?" • Two-handed":""}\n\n${bonuses(item.stats)}`
          : "Item definition is missing.")+notice);
    if(item)embed.addFields({name:"Rarity",value:clean((item.dungeon?.rarity??"common").replace(/_/g," "))});
    if(item?.dungeon?.ability)embed.addFields({name:`✨ ${clean(item.dungeon.ability.name)}`,value:clean(item.dungeon.ability.description??"Weapon ability",500)});
    if(item?.dungeon?.passive)embed.addFields({name:`🐾 ${clean(item.dungeon.passive.name)}`,value:clean(item.dungeon.passive.description??"Equipment passive",500)});
    embed.addFields({name:"Copy Protection",value:copy.is_locked?"🔒 Locked — protected from sales and crafting.":"🔓 Unlocked — available to consume when unequipped.",inline:false});
    let icon;try{icon=await renderInventoryIcon(group.id, item?.dungeon?.rarity ?? "common");}catch(error){console.error("Item thumbnail unavailable:",error.message);}
    if(icon){files.push(new AttachmentBuilder(icon,{name:"item.png"}));embed.setThumbnail("attachment://item.png");}
    if(group.copies.length>1)controls.push(row(new StringSelectMenuBuilder().setCustomId(`${prefix}:copy`)
      .setPlaceholder("Choose an owned copy").setDisabled(expired)
      .addOptions(shown.map(c=>({label:`Copy #${c.serial_number}${c.upgrade_level ? ` +${c.upgrade_level}` : ""}${state.equippedIds.has(String(c.id))?" • Equipped":""}${c.is_locked?" • Locked":""}`,
        value:String(c.id),default:String(c.id)===state.copyId})))));
    if(["material","consumable"].includes(item?.type))controls.push(row(btn(`favorite:${copy.id}:${copy.is_locked?"0":"1"}`,copy.is_locked?"🔓 Unlock":"🔒 Lock")));
    else controls.push(row(
      btn(`equip:${copy.id}`,"Equip",isEquipped||!item||!Object.hasOwn(EQUIPMENT_LABELS,item.slot),ButtonStyle.Success),
      btn(`unequip:${item?.slot??"-"}:${copy.id}`,"Unequip",!isEquipped,ButtonStyle.Danger),
      btn(`previewone:${copy.id}`,"Sell one",isEquipped||copy.is_locked||!saleValue(item),ButtonStyle.Danger),
      btn(`favorite:${copy.id}:${copy.is_locked?"0":"1"}`,copy.is_locked?"🔓 Unlock":"🔒 Lock")
    ));
    controls.push(row(
      btn("back","Back to bag"),btn("loadout","Loadout"),btn("refresh","Refresh")
    ));
    if(pageCount>1)controls.push(row(btn("copiesprevious","Previous copies",state.copyPage===0),btn("copiesnext","Next copies",state.copyPage===pageCount-1)));
  }
  const page=state.view==="item"?state.copyPage:state.view==="bag"?state.page:0;
  embed.setFooter({text:expired?"Controls expired • Use !inventory to reopen":`${state.inventory.length} owned items • Page ${page+1}/${pageCount} • Controls last 5 minutes`});
  // Clear old attachments on every edit so the previous view's image disappears.
  return {content:null,embeds:[embed],components:controls,files,attachments:[],allowedMentions:quiet};
}

export async function openEquipmentPanel(message,options={}) {
  if(!message.inGuild()||message.author.bot)return;
  const prefix=`gear:${message.id}`;
  const state={view:options.view??"loadout",selectedSlot:options.slot??"main_hand",slotFilter:null,
    itemId:options.itemId??null,copyId:options.copyId==null?null:String(options.copyId),page:0,copyPage:0,bagPage:0,
    category:"all",bagCategory:"all",bagSort:"name",sale:null,managerPage:0,showCopies:false,notice:options.notice??"",board:null};
  let reply;
  try {
    await refreshState(state,message.guildId,message.author.id);
    reply=await message.reply(await panel(state,prefix,message.author.username));
  }catch(error){
    console.error("Equipment panel failed:",error);
    return message.reply({content:options.notice?`${options.notice}\nCouldn't display the loadout. Use !inventory to refresh.`:"Couldn't load your equipment. Check the bot log.",allowedMentions:quiet});
  }
  const collector=reply.createMessageComponentCollector({time:300_000,filter:i=>
    (i.isButton()||i.isStringSelectMenu())&&i.customId.startsWith(`${prefix}:`)});
  let updates=Promise.resolve();
  collector.on("collect",async interaction=>{
    if(interaction.user.id!==message.author.id){
      await interaction.reply({content:"These controls belong to another player. Use !inventory.",flags:MessageFlags.Ephemeral}).catch(console.error);return;
    }
    const ack=interaction.deferUpdate().then(()=>null,error=>error);
    let attempted=false,saved=false,financial=false;
    updates=updates.then(async()=>{
      const error=await ack;if(error)throw error;if(collector.ended)return;
      const [action,arg,expectedId]=interaction.customId.slice(prefix.length+1).split(":");
      state.notice="";
      if(action==="refresh")await refreshState(state,message.guildId,message.author.id);
      else if(action==="bagcategory"&&interaction.isStringSelectMenu()){
        const value=interaction.values[0];if(!Object.hasOwn(BAG_CATEGORIES,value))return;
        state.bagCategory=value;state.view="bag";state.page=0;
      }else if(action==="bagsort"&&interaction.isStringSelectMenu()){
        const value=interaction.values[0];if(!Object.hasOwn(BAG_SORTS,value))return;
        state.bagSort=value;state.view="bag";state.page=0;
      }else if(action==="favorite"){
        const copy=state.inventory.find(copy=>String(copy.id)===arg);
        if(state.view!=="item"||!copy||arg!==state.copyId||copy.item_id!==state.itemId||!["0","1"].includes(expectedId))return;
        attempted=true;
        const result=await setItemLocked(message.guildId,message.author.id,arg,expectedId==="1");
        saved=result.success;
        state.notice=result.success?"":"That copy is no longer owned.";
        await refreshState(state,message.guildId,message.author.id);
      }else if(action==="previewone"||action==="previewduplicates"){
        if(action==="previewone"&&(state.view!=="item"||arg!==state.copyId))return;
        if(action==="previewduplicates"&&state.view!=="bag")return;
        const mode=action==="previewone"?"one":"duplicates";
        const plan=await previewItemSale(message.guildId,message.author.id,mode,mode==="one"?arg:null);
        if(!plan.success)state.notice="No eligible copies to sell. Equipped and locked copies are protected; duplicate sales keep one copy per item type.";
        else{state.sale={...plan,token:randomUUID(),expiresAt:Date.now()+60_000,returnView:state.view};state.view="sale";}
      }else if(action==="salecancel"||action==="saleconfirm"){
        if(state.view!=="sale"||!state.sale||state.sale.token!==arg)return;
        const sale=state.sale;state.sale=null;state.view=sale.returnView;
        if(action==="salecancel")state.notice="Sale canceled. No items were sold.";
        else if(Date.now()>sale.expiresAt)state.notice="Sale preview expired. Review a new preview before selling.";
        else{
          attempted=true;financial=true;
          const result=await confirmItemSale(message.guildId,message.author.id,sale.mode,sale.instanceId,sale.quote);
          saved=result.success;
          state.notice=result.success?`Sold ${num(result.sold)} copies for ${num(result.earned)} ${economyConfig.currencyName}.`
            :result.reason==="balance_limit"?"Sale canceled: your balance would exceed the supported limit."
            :"Inventory or prices changed. Nothing was sold; review a new sale preview.";
        }
        await refreshState(state,message.guildId,message.author.id);
      }
      else if(action==="manager") { state.view="manager";state.slotFilter=null; }
      else if(action==="category"&&interaction.isStringSelectMenu()) {
        const category=interaction.values[0];if(!Object.hasOwn(MANAGER_CATEGORIES,category))return;
        state.category=category;state.slotFilter=null;state.managerPage=0;state.itemId=null;state.copyId=null;state.showCopies=false;state.view="manager";
      }else if(action==="manageritem"&&interaction.isStringSelectMenu()) {
        if(state.view!=="manager")return;
        const groups=managerGroups(state);
        const selected=groups.slice(state.managerPage*PAGE_SIZE,(state.managerPage+1)*PAGE_SIZE).find(group=>group.id===interaction.values[0]);
        if(!selected)return;
        state.itemId=selected.id;state.copyId=null;state.showCopies=false;
      }else if(action==="managerprevious"||action==="managernext") {
        if(state.view!=="manager")return;
        state.managerPage+=action==="managernext"?1:-1;state.itemId=null;state.copyId=null;state.showCopies=false;
      }else if(action==="togglecopies") {
        if(state.view!=="manager")return;state.showCopies=!state.showCopies;
      }
      else if(action==="slot"&&interaction.isStringSelectMenu()){
        const slot=interaction.values[0];if(!Object.hasOwn(EQUIPMENT_LABELS,slot))return;
        state.selectedSlot=slot;state.view="loadout";state.board=null;
      }else if(action==="choose"){
        state.slotFilter=state.selectedSlot;state.view="manager";state.category="all";state.managerPage=0;state.itemId=null;state.copyId=null;
      }else if(action==="bag"){
        state.slotFilter=null;state.view="bag";state.page=0;
      }else if(action==="back"){
        state.view="bag";state.page=state.bagPage;
      }else if(action==="loadout")state.view="loadout";
      else if(action==="previous"||action==="next")state.page+=action==="next"?1:-1;
      else if(action==="item"&&interaction.isStringSelectMenu()){
        const groups=bagGroups(state);
        const selected=groups.slice(state.page*PAGE_SIZE,(state.page+1)*PAGE_SIZE).find(g=>g.id===interaction.values[0]);
        if(state.view!=="bag"||!selected)return;
        const copy=(state.bagCategory==="locked"?selected.copies.find(c=>c.is_locked)
          :state.bagCategory==="equipped"?selected.copies.find(c=>state.equippedIds.has(String(c.id))):null)
          ??selected.copies.find(c=>!state.equippedIds.has(String(c.id)))??selected.copies[0];
        state.bagPage=state.page;state.itemId=selected.id;state.copyId=String(copy.id);state.copyPage=0;state.view="item";
      }else if(action==="copy"&&interaction.isStringSelectMenu()){
        const group=groupsFor(state.inventory).find(g=>g.id===state.itemId);
        if(!["item","manager"].includes(state.view)||!group)return;
        const visible=group.copies.slice(state.copyPage*COPY_PAGE_SIZE,(state.copyPage+1)*COPY_PAGE_SIZE);
        if(!visible.some(c=>String(c.id)===interaction.values[0]))return;
        state.copyId=interaction.values[0];
      }else if(action==="copiesprevious"||action==="copiesnext"){
        const group=groupsFor(state.inventory).find(g=>g.id===state.itemId);if(!["item","manager"].includes(state.view)||!group)return;
        const page=Math.max(0,Math.min(Math.ceil(group.copies.length/COPY_PAGE_SIZE)-1,state.copyPage+(action==="copiesnext"?1:-1)));
        state.copyId=String(group.copies[page*COPY_PAGE_SIZE].id);
      }else if(action==="equip"){
        const copy=state.inventory.find(c=>String(c.id)===arg);
        if(!["item","manager"].includes(state.view)||arg!==state.copyId||!copy||copy.item_id!==state.itemId)return;
        if(state.equippedIds.has(String(copy.id)))return;
        attempted=true;
        const result=await equipItemBySerial(message.guildId,message.author.id,copy.item_id,copy.serial_number);
        saved=result.success;
        if(result.success){state.view=state.view==="manager"?"manager":"item";state.selectedSlot=result.slot;state.notice=`✅ Equipped ${result.item.name} #${result.serialNumber}.`+(result.offHandUnequipped?" Off-hand gear returned to your bag.":"");}
        else state.notice=buttonsError[result.reason]??"Could not equip that item.";
        await refreshState(state,message.guildId,message.author.id);
      }else if(action==="unequip"){
        const equipped=state.stats.equipment?.[arg];
        if(!equipped||String(equipped.instanceId)!==expectedId)return;
        attempted=true;
        // Match the exact copy, so an old panel cannot remove replacement gear.
        const result=await unequipItemBySerial(message.guildId,message.author.id,equipped.itemId,equipped.serialNumber);
        saved=result.success;
        state.notice=result.success?`Unequipped ${result.item?.name??"gear"}.`:buttonsError[result.reason]??"Could not unequip that item.";
        await refreshState(state,message.guildId,message.author.id);
      }else return;
      await reply.edit(await panel(state,prefix,message.author.username));
    }).catch(async error=>{
      console.error("Equipment action failed:",error);
      const text=financial?(saved?"Sale completed, but the panel could not refresh. Use !inventory.":"Couldn't confirm the sale. Check your inventory and balance before trying again.")
        :saved?"The change was saved, but the panel could not refresh. Use !inventory."
        :attempted?"Couldn't confirm the equipment change. Use !inventory to check before trying again."
        :"Couldn't update the panel. Use !inventory to reopen it.";
      await interaction.followUp({content:text,flags:MessageFlags.Ephemeral,allowedMentions:quiet}).catch(console.error);
    });
  });
  collector.on("end",()=>{void updates.then(async()=>reply.edit(await panel(state,prefix,message.author.username,true))).catch(console.error);});
  return reply;
}

export async function inventoryCommand(message){return openEquipmentPanel(message,{view:"bag"});}
