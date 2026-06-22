import glob

files = glob.glob('content/**/*.json', recursive=True) + ['metadata/authors.json', 'metadata/classics.json']

traditional_chars = {'為', '學', '國', '書', '經', '詩', '詞', '論', '講', '與', '後', '發', '關', '過', '裡', '體', '聽', '問', '處', '諸', '於', '餘'}

has_traditional = []
for f in files:
    with open(f, 'r', encoding='utf-8') as fp:
        content = fp.read()
        found = [c for c in traditional_chars if c in content]
        if found:
            has_traditional.append((f, found))

if has_traditional:
    for f, chars in has_traditional:
        print(f'仍有繁体字: {f} -> {chars}')
else:
    print('所有知识库文件已成功转换为简体字！')
