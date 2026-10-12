import re, json, glob
keys=[]
def add(k):
    if k not in keys: keys.append(k)
files=['src/anova.js','src/reports.js','src/desc.js','src/regress.js','src/data.js','src/design.js','src/ui/app.js','src/ui/dialogs.js']
for f in files:
    s=open(f).read()
    for m in re.finditer(r"T\('((?:[^'\\]|\\.)*)'", s):
        add(m.group(1).replace("\\'", "'"))
# TEST_NAMES values
s=open('src/anova.js').read()
for m in re.finditer(r"(\w+): '([^']+)'", s[s.index('const TEST_NAMES'):s.index('const TEST_NAMES')+600]): add(m.group(2))
# kernel labels
s=open('src/desc.js').read()
for m in re.finditer(r"label: '([^']+)'", s): add(m.group(1))
for m in re.finditer(r"data-i18n=\"([^\"]+)\"", open('src/ui/index.template.html').read()): add(m.group(1))
b=open('build.js').read()
for m in re.finditer(r"'[\w.]+\.csv': \['([^']+)', ['\"](.+?)['\"]\]", b): add(m.group(1)); add(m.group(2))
for k in ['backward','forward','stepwise','Language','None']: add(k)
keys=[k for k in keys if re.search(r'[A-Za-z]{2}', k) and k not in ('help.models','help.about')]
json.dump(keys, open('/tmp/keys.json','w'), ensure_ascii=False, indent=0)
print(len(keys))
