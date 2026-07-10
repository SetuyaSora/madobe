#!/usr/bin/env python3
import os
import zipfile
import shutil

def main():
    # パス設定
    src_dir = os.path.dirname(os.path.abspath(__file__))
    dist_dir = os.path.join(src_dir, 'dist')
    zip_path = os.path.join(dist_dir, 'chrome-wallpaper.zip')
    
    # distフォルダのクリーンアップ・作成
    if os.path.exists(dist_dir):
        shutil.rmtree(dist_dir)
    os.makedirs(dist_dir)
    
    # 含めるファイル/フォルダの定義
    includes = [
        'manifest.json',
        'newtab.html',
        'newtab.js',
        'assets',
        'css',
        'js'
    ]
    
    print("Building chrome-wallpaper.zip...")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for item in includes:
            item_path = os.path.join(src_dir, item)
            if not os.path.exists(item_path):
                print(f"Warning: {item} not found, skipping.")
                continue
                
            if os.path.isdir(item_path):
                for root, dirs, files in os.walk(item_path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        # zip内の相対パスを計算
                        arcname = os.path.relpath(file_path, src_dir)
                        zip_file.write(file_path, arcname)
                        print(f"Added folder file: {arcname}")
            else:
                arcname = os.path.relpath(item_path, src_dir)
                zip_file.write(item_path, arcname)
                print(f"Added file: {arcname}")
                
    print(f"Successfully created: {zip_path}")

if __name__ == '__main__':
    main()
