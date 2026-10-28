import sharp from "sharp";
import { loadCardImage } from "./renderCard.js";
import { rarityGroup } from "../config/cardShop.js";

const columns=5,cellWidth=200,cellHeight=282,padding=20;
// Digits are drawn as geometric segments. No font files or SVG <text> are used.
const segments={
  0:[0,1,2,3,4,5],1:[1,2],2:[0,1,6,4,3],3:[0,1,6,2,3],
  4:[5,6,1,2],5:[0,5,6,2,3],6:[0,5,6,4,2,3],
  7:[0,1,2],8:[0,1,2,3,4,5,6],9:[0,1,2,3,5,6],
};
const rectangles=[[3,0,12,3],[15,3,3,10],[15,16,3,10],[3,26,12,3],[0,16,3,10],[0,3,3,10],[3,13,12,3]];
function numberSvg(value,x,y) {
  return [...String(value)].map((digit,i)=>segments[digit].map((segment)=>{
    const [rx,ry,w,h]=rectangles[segment];
    return `<rect x="${x+i*23+rx}" y="${y+ry}" width="${w}" height="${h}" rx="1" fill="#edf4ff"/>`;
  }).join("")).join("");
}

export async function renderCardGrid(items,{startNumber=1,imageLoader=loadCardImage}={}) {
  if(!Array.isArray(items) || items.length<1 || items.length>50) throw new Error("A grid needs 1–50 cards.");
  if(!Number.isSafeInteger(startNumber) || startNumber<1 || startNumber>Number.MAX_SAFE_INTEGER-50) throw new Error("Invalid starting number.");
  const width=padding*2+columns*cellWidth;
  const height=padding*2+Math.ceil(items.length/columns)*cellHeight;
  const thumbnails=new Array(items.length);
  let next=0,missing=0;
  // At most four artwork downloads/decodes run together. Duplicate images share the cache.
  await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{
    while(next<items.length) {
      const index=next++;
      try {
        const bytes=await imageLoader(items[index].card,"low");
        thumbnails[index]=await sharp(bytes).resize(180,242,{fit:"contain",background:"#15243a"}).png().toBuffer();
      } catch(error) {
        missing++;
        console.error(`Grid artwork unavailable (${items[index].card.id}):`,error.message);
      }
    }
  }));
  const frames=items.map((item,i)=>{
    const x=padding+(i%columns)*cellWidth,y=padding+Math.floor(i/columns)*cellHeight;
    const color={common:"#9eb2c9",uncommon:"#55daa5",rare:"#60a5fa",special:"#efbd58"}[rarityGroup(item.card.rarity)];
    const labelWidth=String(startNumber+i).length*23;
    return `<rect x="${x}" y="${y}" width="192" height="274" rx="8" fill="#15243a" stroke="${color}" stroke-width="2"/>`+
      numberSvg(startNumber+i,x+Math.max(8,(192-labelWidth)/2),y+243)+
      (!thumbnails[i]?`<path d="M${x+62} ${y+90}l68 68m0-68l-68 68" stroke="#8496b2" stroke-width="5"/>`:"");
  }).join("");
  const background=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0b1424"/>${frames}</svg>`);
  const overlays=thumbnails.flatMap((input,i)=>input?[{input,left:padding+(i%columns)*cellWidth+6,top:padding+Math.floor(i/columns)*cellHeight+1}]:[]);
  // JPEG keeps a 50-card attachment compact. Try lower quality if needed.
  let image=await sharp(background).composite(overlays).jpeg({quality:82,mozjpeg:true}).toBuffer();
  if(image.length>7_500_000) image=await sharp(background).composite(overlays).jpeg({quality:60,mozjpeg:true}).toBuffer();
  if(image.length>7_500_000) throw new Error("Collection image is too large to attach.");
  return {image,missing,width,height};
}
