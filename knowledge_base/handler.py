"""阿里云函数计算入口文件

将 Flask 应用适配为函数计算 HTTP 触发器。
部署时将此文件与 scripts/ 目录一起打包。
"""
import sys
import os

# 添加 scripts 目录到 Python 路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "scripts"))

from scripts.api_server import app

# 阿里云函数计算 HTTP 触发器入口
def handler(environ, start_response):
    """WSGI 入口，适配阿里云函数计算 HTTP 触发器"""
    return app.wsgi_app(environ, start_response)
