import { rarityGroup } from "../config/cardShop.js";

export const cardSize = {width:640,height:960};
export const element = (type,style,children,extra={}) => ({type,props:{style,children,...extra}});
const box=(style,children)=>element("div",{display:"flex",...style},children);
const text=(value,size=18,color="#dce5f6",style={})=>box({fontSize:size,color,...style},String(value??""));
const clip=(value,max)=>String(value??"").slice(0,max);

// Pure stateless Satori component. No JSX transpiler or React installation needed.
export function CardComponent({card,imageDataUrl,copyId="Preview"}) {
  const group=rarityGroup(card.rarity);
  const accent={common:"#9eb2c9",uncommon:"#5ce1aa",rare:"#63acff",special:"#f5c569"}[group];
  const attacks=(card.attacks??[]).slice(0,2);
  const category=card.category??"Card";
  const info=[
    ["CATEGORY",category],
    ["TYPE",(card.types??[]).join(" / ")||category],
    ["HP / STAGE",`${card.hp??"—"} / ${card.stage??"—"}`],
    ["ILLUSTRATOR",card.illustrator??"Not listed"],
  ];
  return box({width:640,height:960,padding:26,flexDirection:"column",backgroundColor:"#101a2d",
    border:`3px solid ${accent}`,borderRadius:30,fontFamily:"CardSans",color:"#ffffff"},[
    box({alignItems:"center",justifyContent:"space-between",marginBottom:14},[
      text("BOTANIC // CARD COLLECTION",13,accent,{fontWeight:700,letterSpacing:2}),
      text("TCGDEX",12,"#8395b3"),
    ]),
    text(clip(card.name,40),String(card.name).length>23?30:38,"#ffffff",{fontWeight:700}),
    box({alignItems:"center",justifyContent:"space-between",marginTop:10,marginBottom:20},[
      box({backgroundColor:accent,color:"#101a2d",borderRadius:8,padding:"7px 12px",fontSize:15,fontWeight:700},clip(card.rarity,35)),
      text(clip(card.id,28),14,"#91a3c0"),
    ]),
    box({height:365,flexShrink:0,marginBottom:20},[
      box({width:265,height:365,backgroundColor:"#18263f",borderRadius:14,alignItems:"center",justifyContent:"center",overflow:"hidden"},
        imageDataUrl ? element("img",{objectFit:"contain",borderRadius:10},undefined,{src:imageDataUrl,width:251,height:346})
          : text("Artwork unavailable",15,"#91a3c0")),
      box({width:285,marginLeft:20,flexDirection:"column",justifyContent:"space-between"},[
        ...info.map(([label,value])=>box({flexDirection:"column"},[
          text(label,11,accent,{letterSpacing:1,fontWeight:700,marginBottom:5}),
          text(clip(value,44),18,"#eaf0ff"),
        ])),
      ]),
    ]),
    text(clip(card.set?.name??"Unknown set",48),22,"#ffffff",{fontWeight:700}),
    text(clip(card.description??card.effect??"Collect, trade, and complete your collection.",210),17,"#aebed7",
      {marginTop:9,lineHeight:1.4,height:83,overflow:"hidden"}),
    box({flexDirection:"column",marginTop:12},attacks.length ? attacks.map((attack)=>
      box({flexDirection:"column",backgroundColor:"#1b2a44",borderRadius:12,padding:13,marginBottom:9},[
        box({justifyContent:"space-between"},[
          text(clip(attack.name,32),19,"#ffffff",{fontWeight:700}),
          text(attack.damage??"—",20,accent,{fontWeight:700}),
        ]),
        text(clip(attack.effect??(attack.cost??[]).join(" / "),105),13,"#aebed7",{marginTop:5,lineHeight:1.3}),
      ])) : [text(clip(card.effect??"A collectible from your card collection.",190),16,"#aebed7")]),
    box({marginTop:"auto",paddingTop:12,borderTop:"1px solid #33445f",justifyContent:"space-between"},[
      text("Data & original card image: TCGdex",11,"#8094b4"),
      text(`COPY ${clip(copyId,8)}`,11,accent),
    ]),
  ]);
}
