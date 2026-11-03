import { equipItemBySerial, getUserInventory, ITEMS } from "../database/items.js";
import { openEquipmentPanel } from "./inventory.js";
const quiet={parse:[],repliedUser:false};

export async function equipCommand(message){
  if(!message.inGuild()||message.author.bot)return;
  const args=message.content.trim().split(/\s+/).slice(1);
  // !equip opens the compact manager with an automatic copy selection.
  if(!args.length)return openEquipmentPanel(message,{view:"manager"});
  const itemId=args[0]?.toLowerCase();
  if(args.length>2||(args[1]!==undefined&&!/^\d+$/.test(args[1]))){
    return message.reply({content:"Use !equip to browse, or `!equip <item-id> [serial-number]`.",allowedMentions:quiet});
  }
  if(!Object.hasOwn(ITEMS,itemId))return message.reply({content:"That item isn't configured. Use !equip to browse your bag.",allowedMentions:quiet});
  let serial=args[1]===undefined?null:Number(args[1]);
  if(serial!==null&&(!Number.isSafeInteger(serial)||serial<1)){
    return message.reply({content:"Enter a valid positive whole-number serial.",allowedMentions:quiet});
  }
  let result;
  try{
    if(serial===null){
      const copies=(await getUserInventory(message.guildId,message.author.id))
        .filter(c=>c.item_id===itemId).sort((a,b)=>Number(a.serial_number)-Number(b.serial_number));
      if(!copies.length)return message.reply({content:"You don't own that item. Use !inventory.",allowedMentions:quiet});
      serial=copies[0].serial_number;
    }
    result=await equipItemBySerial(message.guildId,message.author.id,itemId,serial);
  }catch(error){
    console.error("Equip failed:",error);
    return message.reply({content:"Couldn't confirm the equipment change. Use !inventory to check before trying again.",allowedMentions:quiet});
  }
  if(!result.success){
    const errors={not_owned:"You don't own that copy.",invalid_item:"That item isn't configured.",invalid_type:"That item has no valid equipment slot.",two_handed_equipped:"Unequip your two-handed weapon before using off-hand gear."};
    return message.reply({content:errors[result.reason]??"Couldn't equip that item.",allowedMentions:quiet});
  }
  // The mutation has committed. Opening a panel must never repeat it.
  return openEquipmentPanel(message,{view:"manager",itemId,copyId:result.instanceId,slot:result.slot,notice:
    `✅ Equipped ${result.item.name} #${result.serialNumber}.`+
    (result.offHandUnequipped?" Off-hand gear returned to your bag.":"")});
}
