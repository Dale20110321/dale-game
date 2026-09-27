import sys
from PIL import Image

im = Image.open(sys.argv[1]).convert("RGB")
W, H = im.size
print("size", W, H)

def avg(region):
    crop = im.crop(region)
    px = list(crop.getdata())
    n = len(px)
    return tuple(round(sum(p[i] for p in px) / n) for i in range(3))

print("TL quadrant avg (0..W/2 x 0..H/2):", avg((0, 0, W // 2, H // 2)))
print("center quadrant avg:", avg((int(W * 0.4), int(H * 0.4), int(W * 0.6), int(H * 0.6))))

for (x, y) in [(20, 40), (100, 40), (200, 40), (320, 40), (640, 360),
               (int(W * 0.13), int(H * 0.095)),
               (int(W * 0.40), int(H * 0.30))]:
    print(f"px({x},{y})", im.getpixel((x, y)))
