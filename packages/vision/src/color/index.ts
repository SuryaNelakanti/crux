/**
 * Color utilities for mask generation
 * 
 * All functions are pure and deterministic.
 * No platform dependencies.
 */

export interface RGB {
    r: number; // 0-255
    g: number; // 0-255
    b: number; // 0-255
}

export interface HSL {
    h: number; // 0-360
    s: number; // 0-100
    l: number; // 0-100
}

export interface LAB {
    l: number; // 0-100
    a: number; // -128 to 127
    b: number; // -128 to 127
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(rgb: RGB): HSL {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    let h = 0;
    let s = 0;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                h = ((b - r) / d + 2) / 6;
                break;
            case b:
                h = ((r - g) / d + 4) / 6;
                break;
        }
    }

    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100),
    };
}

/**
 * Convert HSL to RGB
 */
export function hslToRgb(hsl: HSL): RGB {
    const h = hsl.h / 360;
    const s = hsl.s / 100;
    const l = hsl.l / 100;

    let r: number, g: number, b: number;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255),
    };
}

/**
 * Convert RGB to LAB (CIE L*a*b*)
 * More perceptually uniform than RGB for color comparison
 */
export function rgbToLab(rgb: RGB): LAB {
    // First convert to XYZ
    let r = rgb.r / 255;
    let g = rgb.g / 255;
    let b = rgb.b / 255;

    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

    const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0;
    const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;

    const fx = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116;
    const fy = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116;
    const fz = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116;

    return {
        l: 116 * fy - 16,
        a: 500 * (fx - fy),
        b: 200 * (fy - fz),
    };
}

/**
 * Calculate color distance in LAB space (Delta E)
 * Lower values = more similar colors
 */
export function colorDistanceLab(lab1: LAB, lab2: LAB): number {
    return Math.sqrt(
        Math.pow(lab1.l - lab2.l, 2) +
        Math.pow(lab1.a - lab2.a, 2) +
        Math.pow(lab1.b - lab2.b, 2)
    );
}

/**
 * Calculate color distance using RGB (faster but less accurate)
 */
export function colorDistanceRgb(rgb1: RGB, rgb2: RGB): number {
    return Math.sqrt(
        Math.pow(rgb1.r - rgb2.r, 2) +
        Math.pow(rgb1.g - rgb2.g, 2) +
        Math.pow(rgb1.b - rgb2.b, 2)
    );
}

/**
 * Check if a color is "saturated" (likely a hold, not wall)
 */
export function isSaturated(hsl: HSL, threshold: number = 25): boolean {
    return hsl.s >= threshold;
}

/**
 * Get the dominant hue from an array of HSL colors
 */
export function getDominantHue(colors: HSL[]): number {
    if (colors.length === 0) return 0;

    // Use circular mean for hue
    let sinSum = 0;
    let cosSum = 0;

    for (const color of colors) {
        const rad = (color.h * Math.PI) / 180;
        sinSum += Math.sin(rad);
        cosSum += Math.cos(rad);
    }

    const meanRad = Math.atan2(sinSum, cosSum);
    let meanHue = (meanRad * 180) / Math.PI;
    if (meanHue < 0) meanHue += 360;

    return Math.round(meanHue);
}
