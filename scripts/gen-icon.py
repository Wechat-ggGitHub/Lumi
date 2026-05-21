#!/usr/bin/env python3
"""Generate warm-light app icon - brighter, richer version."""

from PIL import Image, ImageDraw, ImageFilter, ImageChops
import math

SIZE = 1024
CORNER_RADIUS = 224


def make_rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        [(0, 0), (size - 1, size - 1)],
        radius=radius,
        fill=255
    )
    return mask


def radial_gradient(size: int, stops: list) -> Image.Image:
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    cx, cy = size / 2, size / 2
    max_r = size / 2

    steps = 2048
    lut = {'r': [0]*steps, 'g': [0]*steps, 'b': [0]*steps, 'a': [0]*steps}

    for i in range(steps):
        t = i / (steps - 1)
        for j in range(len(stops) - 1):
            t0, c0 = stops[j]
            t1, c1 = stops[j + 1]
            if t0 <= t <= t1:
                f = (t - t0) / (t1 - t0) if t1 != t0 else 0
                f = f * f * (3 - 2 * f)
                lut['r'][i] = int(c0[0] + (c1[0] - c0[0]) * f)
                lut['g'][i] = int(c0[1] + (c1[1] - c0[1]) * f)
                lut['b'][i] = int(c0[2] + (c1[2] - c0[2]) * f)
                lut['a'][i] = int(c0[3] + (c1[3] - c0[3]) * f)
                break

    pixels = img.load()
    for y in range(size):
        dy = y - cy
        dy2 = dy * dy
        for x in range(size):
            dx = x - cx
            dist = math.sqrt(dx * dx + dy2)
            t = min(dist / max_r, 1.0)
            idx = min(int(t * (steps - 1)), steps - 1)
            pixels[x, y] = (lut['r'][idx], lut['g'][idx], lut['b'][idx], lut['a'][idx])

    return img


def main():
    print('Creating masks...')
    mask = make_rounded_mask(SIZE, CORNER_RADIUS)

    # --- Layer 1: Warm brown gradient background (not black!) ---
    print('Creating warm background...')
    bg_stops = [
        (0.00, (60, 38, 25, 255)),   # warm chocolate center
        (0.50, (38, 24, 16, 255)),   # dark espresso
        (0.85, (25, 15, 10, 255)),   # very dark brown
        (1.00, (18, 10, 6,  255)),   # darkest edge
    ]
    bg_grad = radial_gradient(SIZE, bg_stops)

    bg = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    bg.paste(bg_grad, mask=mask)

    # --- Layer 2: Bright warm glow (lamp core) ---
    print('Creating bright glow...')
    glow_stops = [
        (0.00, (255, 230, 150, 255)),  # bright warm white-gold
        (0.04, (255, 218, 120, 255)),  # golden
        (0.10, (255, 195, 85,  255)),  # amber gold
        (0.18, (245, 165, 55,  255)),  # warm amber
        (0.28, (225, 135, 50,  250)),  # orange-amber
        (0.40, (200, 115, 55,  235)),  # copper
        (0.52, (184, 100, 58,  200)),  # brand #B8723D area
        (0.65, (140, 70,  35,  140)),  # warm brown
        (0.78, (80,  40,  20,  70)),   # dark warm
        (0.90, (35,  18,  10,  20)),   # very dark
        (1.00, (18,  10,  6,   0)),    # fade to bg
    ]
    glow = radial_gradient(SIZE, glow_stops)

    # Larger blur for soft ethereal diffusion
    glow_blurred = glow.filter(ImageFilter.GaussianBlur(radius=45))

    # Composite glow onto background
    bg.paste(glow_blurred, mask=glow_blurred.split()[3])

    # --- Layer 3: Extra bright core (hot center of the lamp) ---
    print('Adding bright core...')
    core_size = int(SIZE * 0.35)
    core = Image.new('RGBA', (core_size, core_size), (0, 0, 0, 0))
    cx_core, cy_core = core_size / 2, core_size / 2
    core_pixels = core.load()
    for y in range(core_size):
        dy = y - cy_core
        dy2 = dy * dy
        for x in range(core_size):
            dx = x - cx_core
            dist = math.sqrt(dx * dx + dy2)
            t = min(dist / (core_size / 2), 1.0)
            if t <= 1.0:
                alpha = int(255 * max(0, 1 - t) ** 2.5)
                r = 255
                g = int(240 - 60 * t)
                b = int(200 - 140 * t)
                core_pixels[x, y] = (r, g, b, alpha)

    core_blurred = core.filter(ImageFilter.GaussianBlur(radius=30))
    offset = (SIZE - core_size) // 2
    bg.paste(core_blurred, (offset, offset), core_blurred.split()[3])

    # --- Apply squircle mask ---
    final = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    final.paste(bg, mask=mask)

    # --- Subtle warm edge glow ---
    inner_mask = make_rounded_mask(SIZE, CORNER_RADIUS - 4)
    edge_mask = ImageChops.subtract(mask, inner_mask)
    edge_glow = Image.new('RGBA', (SIZE, SIZE), (200, 140, 70, 35))
    edge_layer = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    edge_layer.paste(edge_glow, mask=edge_mask)
    edge_blurred = edge_layer.filter(ImageFilter.GaussianBlur(radius=4))
    final.paste(edge_blurred, mask=edge_blurred.split()[3])

    final.save('resources/icon.png', 'PNG')
    final.save('public/icon.png', 'PNG')

    print(f'Saved icon ({final.size})')
    print(f'Center: {final.getpixel((512, 512))}')
    print(f'Mid-edge: {final.getpixel((100, 512))}')
    print(f'Corner: {final.getpixel((0, 0))}')


if __name__ == '__main__':
    main()
