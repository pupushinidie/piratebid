#!/bin/zsh
while kill -0 62120 2>/dev/null; do sleep 5; done
cd ~/projects/pipeline/games/piratebid/art && PIXELLAB_BUDGET_USD=5 ~/miniconda3/envs/quant/bin/python anim.py ghost2 > out/anim2.log 2>&1
