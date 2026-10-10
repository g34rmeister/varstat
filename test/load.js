require('../src/dist.js');require('../src/linalg.js');
const Data=require('../src/data.js'),A=require('../src/anova.js'),fs=require('fs');
global.load=(f)=>Data.parseDelimited(fs.readFileSync(__dirname+'/data/'+f,'utf8'));
global.A=A;global.Data=Data;
