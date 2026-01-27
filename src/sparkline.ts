/**
 * Create an inline SVG sparkline string for the given sequence of numbers.
 *
 * Usage:
 *   npx ts-node sparkline.ts 1 2 3 4 5
 *   npx ts-node sparkline.ts 1 2 3 4 5 --width 200 --color blue --line-width 2.0
 */

export interface SparklineOptions {
  width?: number;
  color?: string;
  lineWidth?: number;
  viewHeight?: number;
  padding?: number;
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "miter" | "round" | "bevel";
  dashArray?: string;
}

/**
 * Generate an inline SVG sparkline string optimized for embedding within paragraph text.
 *
 * The resulting SVG has no fixed pixel height attribute; instead, it uses CSS `height: 2.0ex`
 * to scale naturally with the surrounding font size. This minimizes layout disruption in
 * Markdown renderers such as Obsidian.
 *
 * @param numbers - Sequence of numeric values to plot
 * @param options - Configuration options
 * @param options.width - Width of the SVG in pixels (default: 100)
 * @param options.color - Stroke color in CSS format (default: "currentColor")
 * @param options.lineWidth - Thickness of the line (default: 1.0)
 * @param options.viewHeight - Height of the viewBox coordinate system (default: 20)
 * @param options.padding - Vertical padding inside the viewBox (default: 2.0 units)
 * @returns Complete SVG string (single line, no newlines) suitable for inline HTML/Markdown
 */
export function sparkline(
  numbers: number[],
  options: SparklineOptions = {}
): string {
  const {
    width = 100,
    color = "currentColor",
    lineWidth = 1.0,
    viewHeight = 20,
    padding = 2.0,
  } = options;

  if (numbers.length === 0) {
    return `<svg width="${width}" viewBox="0 0 ${width} ${viewHeight}"></svg>`;
  }

  // Duplicate single value for a visible (flat) line
  let data = numbers;
  if (data.length === 1) {
    data = [data[0], data[0]];
  }

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const valueRange = maxVal - minVal;

  // Effective plotting height inside viewBox
  const plotHeight = viewHeight - 2 * padding;

  let pathData: string;

  if (valueRange === 0) {
    // Flat line centered vertically
    const yMid = viewHeight / 2;
    pathData = `M 0 ${yMid.toFixed(1)} L ${width} ${yMid.toFixed(1)}`;
  } else {
    // Scale values to plotHeight and apply padding
    const scaled = data.map(
      (val) => ((val - minVal) / valueRange) * plotHeight + padding
    );

    // x-coordinates evenly spaced across full width
    const xCoords = data.map((_, i) => (i * width) / (data.length - 1));

    // Build path (y inverted: 0 at top)
    const commands = [
      `M ${xCoords[0].toFixed(1)} ${(viewHeight - scaled[0]).toFixed(1)}`,
    ];
    for (let i = 1; i < data.length; i++) {
      commands.push(
        `L ${xCoords[i].toFixed(1)} ${(viewHeight - scaled[i]).toFixed(1)}`
      );
    }
    pathData = commands.join(" ");
  }

  // Construct compact inline SVG
  const svg =
    `<svg viewBox="0 0 ${width} ${viewHeight}" ` +
    `width="${width}" ` +
    `style="height:2.0ex; vertical-align:middle; margin:0 0.3em;" ` +
    `preserveAspectRatio="xMidYMid meet">` +
    `<path d="${pathData}" fill="none" stroke="${color}" stroke-width="${lineWidth}" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`;

  return svg;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): {
  numbers: number[];
  width: number;
  color: string;
  lineWidth: number;
} {
  const numbers: number[] = [];
  let width = 100;
  let color = "red";
  let lineWidth = 1.0;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--width" && i + 1 < args.length) {
      width = parseInt(args[i + 1], 10);
      i += 2;
    } else if (arg === "--color" && i + 1 < args.length) {
      color = args[i + 1];
      i += 2;
    } else if (arg === "--line-width" && i + 1 < args.length) {
      lineWidth = parseFloat(args[i + 1]);
      i += 2;
    } else if (!arg.startsWith("--")) {
      const num = parseFloat(arg);
      if (!isNaN(num)) {
        numbers.push(num);
      }
      i++;
    } else {
      i++;
    }
  }

  return { numbers, width, color, lineWidth };
}

/**
 * Main CLI entry point
 */
function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`Usage: npx ts-node sparkline.ts <numbers...> [options]

Generate an SVG sparkline for the given numbers.

Arguments:
  numbers         One or more numbers to plot

Options:
  --width <n>     Width of the SVG in pixels (default: 100)
  --color <s>     Stroke color in CSS format (default: red)
  --line-width <n> Thickness of the line (default: 1.0)
  --help, -h      Show this help message

Examples:
  npx ts-node sparkline.ts 1 2 3 4 5
  npx ts-node sparkline.ts 1 2 3 4 5 --width 200 --color blue --line-width 2.0
`);
    return;
  }

  const { numbers, width, color, lineWidth } = parseArgs(args);

  if (numbers.length === 0) {
    console.error("Error: At least one number is required");
    process.exit(1);
  }

  const svg = sparkline(numbers, { width, color, lineWidth });
  process.stdout.write(svg + "\n");
}

// Only run CLI when executed directly (not when imported)
if (typeof process !== "undefined" && process.argv[1]?.endsWith("sparkline.ts")) {
  main();
}
