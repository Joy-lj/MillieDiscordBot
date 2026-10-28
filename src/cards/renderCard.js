import sharp from "sharp";
import { readFile,writeFile,mkdir,rename,unlink } from "node:fs/promises";
import { createHash,randomUUID } from "node:crypto";

const cache=new URL("../../data/card-art/",import.meta.url);
const pending=new Map();

export async function loadCardImage(card,quality="high") {
  if(!card.image) throw new Error(`No image available for ${card.name}.`);
  if(!["low","high"].includes(quality)) throw new Error("Invalid image quality.");
  const url=new URL(`${card.image}/${quality}.png`);
  if(url.protocol!=="https:" || url.hostname!=="assets.tcgdex.net") throw new Error("Untrusted card image source.");
  const key=createHash("sha256").update(url.href).digest("hex");
  if(pending.has(key)) return pending.get(key);
  const task=(async()=>{
    await mkdir(cache,{recursive:true});
    const path=new URL(`${key}.png`,cache);
    try {return await readFile(path);} catch(error) {if(error.code!=="ENOENT") throw error;}
    const response=await fetch(url,{signal:AbortSignal.timeout(12_000)});
    if(!response.ok) throw new Error(`Card image download failed: HTTP ${response.status}`);
    const downloaded=Buffer.from(await response.arrayBuffer());
    if(downloaded.length>8_000_000) throw new Error("Card image is too large.");
    const image=await sharp(downloaded).resize({width:600,height:825,fit:"inside",withoutEnlargement:true}).png().toBuffer();
    // A failed process cannot leave a partially written cached PNG.
    const temporary=new URL(`${key}.${randomUUID()}.tmp`,cache);
    try {await writeFile(temporary,image);await rename(temporary,path);}
    finally {await unlink(temporary).catch(()=>{});}
    return image;
  })();
  pending.set(key,task);
  try{return await task;}finally{pending.delete(key);}
}

// Same function contract as before. Original TCGdex images contain their own text.
export async function renderCard(card,copyId) {
  return loadCardImage(card,"high");
}
