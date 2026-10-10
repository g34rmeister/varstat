require("./load.js");
const clover={columns:[{name:"Strain",type:"text",values:[]},{name:"Nitrogen",type:"numeric",values:[]}]};
const S={"3DOK1":[19.4,32.6,27.0,32.1,33.0],"3DOK5":[17.7,24.8,27.9,25.2,24.3],"3DOK4":[17.0,19.4,9.1,11.9,15.8],"3DOK7":[20.7,21.0,20.5,18.8,18.6],"3DOK13":[14.3,14.4,11.8,11.6,14.2],"COMPOS":[17.3,19.4,19.1,16.9,20.8]};
for(const [k,v] of Object.entries(S)) for(const x of v){clover.columns[0].values.push(k);clover.columns[1].values.push(x);}
const terms=A.parseModel(["Strain"],["Strain","Nitrogen"]);
const r=A.analyze(clover,terms,"Nitrogen","none",{0:["wallerduncan","tukey","snk","scottknott","lsd","bonferroni"].map(t=>({test:t,alpha:0.05}))});
for(const b of r.blocks){ if(b.type==="table"&&b.groupsCol) console.log(b.rows.map(x=>x[0]+":"+x[2].toFixed(2)+":"+x[b.groupsCol]).join("  ")); if(b.type==="heading")console.log("#",b.text)}
