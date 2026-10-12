require('../src/dist.js');require('../src/linalg.js');
const Data=require('../src/data.js'),A=require('../src/anova.js'),fs=require('fs');
// These tests use Sisvar's own example files, which are not redistributed with VarStat.
// Copy the CSV versions from your Sisvar installation into test/sisvar-data/ to run them.
const SV=__dirname+'/sisvar-data/';
if(!fs.existsSync(SV+'Pimen98.csv')){console.log('skipped: copy Sisvar\'s example files into test/sisvar-data/ to run this test');process.exit(0);}
global.load=(f)=>Data.parseDelimited(fs.readFileSync(SV+f,'utf8'));
global.A=A;global.Data=Data;
