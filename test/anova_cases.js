require('./load.js');
const cases=[
 {f:'pimen43.csv',y:'gp',m:['racoes'],r:'y ~ racoes'},
 {f:'Pimen57.csv',y:'Produções (t/ha)',m:['Bloco','Variedades'],r:'y ~ Bloco + Variedades'},
 {f:'ST224.csv',y:'Produtividade (kg/parcela',m:['Row','Column','[Cultivares de trigo]'],r:'y ~ Row + Column + Cultivares.de.trigo'},
 {f:'Pimen98.csv',y:'Produções de milho',m:['Bloco','N','P','K','N*P','N*K','P*K','N*P*K'],r:'y ~ Bloco + N*P*K'},
 {f:'Pimen98.csv',y:'Produções de milho',m:['Bloco','N','erro=Bloco*N','P','N*P'],r:'y ~ Bloco + N + Bloco:N + P + N:P'},
 {f:'Pimen157.csv',y:'Produtividade',m:['Bloco','Variedade','erro=Bloco*Variedade','anos','erro=Bloco*anos','Variedade*anos'],r:'y ~ Bloco + Variedade + Bloco:Variedade + anos + Bloco:anos + Variedade:anos'},
 {f:'exemploartigo.csv',y:'prod',m:['rep','bloc(rep)','tipo','trat(tipo)'],r:'y ~ rep + rep:bloc + tipo + tipo:trat'},
 {f:'St369.csv',y:'Raiz do número de Quack-g',m:['blocos','[Dias de espera para culti]','[Maleic hydrazide/acre]','[Dias de espera para culti]*[Maleic hydrazide/acre]'],r:'y ~ blocos + Dias.de.espera.para.culti*Maleic.hydrazide.acre'},
 {f:'Nitrogenio.csv',y:'Altura',m:['Dose','erro=Rep(Dose)','Dias','Dose*Dias'],r:'y ~ Dose + Dose:Rep + Dias + Dose:Dias'},
];
const out=[];
for(const c of cases){const d=load(c.f);const terms=A.parseModel(c.m,d.columns.map(x=>x.name));const fit=A.fitModel(d,terms,c.y);
 out.push({f:c.f,y:c.y,r:c.r,data:Object.fromEntries(d.columns.map(x=>[x.name,x.values])),rows:fit.rows.map(r=>[r.label,r.df,r.ss,r.F??null]).concat([['Residual',fit.residual.df,fit.residual.ss,null]])});}
require('fs').writeFileSync('/tmp/js_anova.json',JSON.stringify(out));
