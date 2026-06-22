import json
import os
from opencc import OpenCC

cc = OpenCC('t2s')

def convert_to_simplified(text):
    if isinstance(text, str):
        return cc.convert(text)
    return text

def convert_json(obj):
    if isinstance(obj, dict):
        return {key: convert_json(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_json(item) for item in obj]
    elif isinstance(obj, str):
        return cc.convert(obj)
    else:
        return obj

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    original_text = json.dumps(data, ensure_ascii=False)
    converted_data = convert_json(data)
    converted_text = json.dumps(converted_data, ensure_ascii=False)
    
    if original_text != converted_text:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(converted_data, f, ensure_ascii=False, indent=2)
        print(f"已转换: {filepath}")
    else:
        print(f"无需转换: {filepath}")

def main():
    knowledge_base_dir = '/Users/bareerah/trae/注疏时光机/knowledge_base'
    
    for root, dirs, files in os.walk(knowledge_base_dir):
        for filename in files:
            if filename.endswith('.json'):
                filepath = os.path.join(root, filename)
                process_file(filepath)

if __name__ == '__main__':
    main()
