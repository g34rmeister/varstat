const D=require('../src/dist.js');
const cases=[
 ['pnorm(1.96)',D.pnorm(1.96)],['qnorm(0.975)',D.qnorm(0.975)],['pnorm(-10)',D.pnorm(-10)],
 ['pt(2.1,5)',D.pt(2.1,5)],['qt(0.975,3)',D.qt(0.975,3)],['qt(0.995,1)',D.qt(0.995,1)],['qt(0.025,20)',D.qt(0.025,20)],
 ['pchisq(3.84,1)',D.pchisq(3.84,1)],['qchisq(0.95,10)',D.qchisq(0.95,10)],['qchisq(0.01,2)',D.qchisq(0.01,2)],
 ['pf(4.2,3,12,lower=F)',D.pf(4.2,3,12,true)],['qf(0.95,3,12)',D.qf(0.95,3,12)],['qf(0.99,1,1000)',D.qf(0.99,1,1000)],
 ['pchisq(10,4,ncp=3)',D.pchisqNC(10,4,3)],['qchisq(0.9,4,ncp=3)',D.qchisqNC(0.9,4,3)],
 ['pt(2,10,ncp=1.5)',D.ptNC(2,10,1.5)],['pt(-1,7,ncp=2)',D.ptNC(-1,7,2)],['qt(0.95,10,ncp=1.5)',D.qtNC(0.95,10,1.5)],
 ['pbinom(3,10,0.4)',D.pbinom(3,10,0.4)],['dbinom(3,10,0.4)',D.dbinom(3,10,0.4)],['ppois(4,3.2)',D.ppois(4,3.2)],
 ['ptukey(3.5,4,12)',D.ptukey(3.5,4,12)],['qtukey(0.95,4,12)',D.qtukey(0.95,4,12)],['qtukey(0.95,2,1)',D.qtukey(0.95,2,1)],
 ['qtukey(0.99,10,5)',D.qtukey(0.99,10,5)],['qtukey(0.95,20,60)',D.qtukey(0.95,20,60)],['qtukey(0.95,3,Inf)',D.qtukey(0.95,3,Infinity)],
 ['qtukey(0.95,50,2)',D.qtukey(0.95,50,2)],['ptukey(1,3,3)',D.ptukey(1,3,3)]];
const t0=Date.now();
for(const [e,v] of cases) console.log(e+'\t'+v.toPrecision(12));
console.error('ms',Date.now()-t0);
