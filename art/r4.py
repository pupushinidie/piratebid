"""第 4 轮：头像每种补第 3 个候选（seed 503）。"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from r1 import JOBS, run
from concurrent.futures import ThreadPoolExecutor
jobs = [j for j in list(JOBS) if j[0].startswith("ava-") and j[0].endswith("-s501") and "ghost" not in j[0]]
jobs = [(n.replace("-s501", "-s503"), ep, dict(b, seed=503)) for n, ep, b in jobs]
with ThreadPoolExecutor(max_workers=8) as pool:
    for n, r in pool.map(run, jobs):
        print(n, r, flush=True)
print("全部完成", flush=True)
