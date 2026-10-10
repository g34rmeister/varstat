import json, re, sys, os
keys=json.load(open('/tmp/keys.json'))
for lang in sys.argv[1:]:
    d={}; bad=[]
    old={}
    jf=f'i18n_src/{lang}.json'
    if os.path.exists(jf): old=json.load(open(jf))
    if os.path.exists(f'i18n_src/{lang}.txt'):
        for ln in open(f'i18n_src/{lang}.txt',encoding='utf8').read().splitlines():
            if not ln.strip(): continue
            i,t=ln.split('|',1); i=int(i)
            k=keys[i]
            if sorted(re.findall(r'\{\d\}',k))!=sorted(re.findall(r'\{\d\}',t)): bad.append((i,k,t))
            d[k]=t
    d={**old,**d}
    json.dump(d,open(jf,'w'),ensure_ascii=False,indent=0)
    extra={}
    hf=f'i18n_src/{lang}.help.json'
    if os.path.exists(hf): extra=json.load(open(hf))
    out={**d,**extra}
    open(f'src/i18n/{lang}.js','w').write(f"/* {lang} translations */\nI18N.add('{lang}', "+json.dumps(out,ensure_ascii=False,indent=0)+");\n")
    missing=[k for k in keys if k not in d]
    print(lang,'entries',len(d),'missing',len(missing),'placeholder mismatches',len(bad))
    for b in bad: print('  BAD',b)
