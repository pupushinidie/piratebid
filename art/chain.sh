#!/bin/zsh
# 等动画进程结束再起封面，保证同一时间只有一个出图进程
while kill -0 61877 2>/dev/null; do sleep 5; done
cd ~/projects/pipeline/games/piratebid/art && PIXELLAB_BUDGET_USD=5 ~/miniconda3/envs/quant/bin/python r3.py > out/r3.log 2>&1
