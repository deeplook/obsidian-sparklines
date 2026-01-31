/**
 * Create an inline SVG sparkline string for the given sequence of numbers.
 *
 * Usage:
 *   npx ts-node sparkline.ts 1 2 3 4 5
 *   npx ts-node sparkline.ts 1 2 null 4 5 --width 200 --color blue --line-width 2.0
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
 * Result of generating sparkline path data
 */
export interface SparklinePathData {
  /** SVG path data string for the line segments */
  pathData: string;
  /** Positions of isolated points that need to be rendered as circles */
  isolatedPoints: Array<{ x: number; y: number }>;
  /** Whether there are any line segments (vs only isolated points) */
  hasLines: boolean;
  /** ViewBox dimensions */
  viewBox: { width: number; height: number };
}

/**
 * Generate sparkline path data from numbers (with null support for gaps).
 * This is the core algorithm that can be used by both CLI and DOM rendering.
 *
 * @param numbers - Array of numbers or nulls (null creates gaps)
 * @param options - Configuration options
 * @returns Path data and metadata for rendering
 */
export function generateSparklinePathData(
  numbers: Array<number | null>,
  options: SparklineOptions = {}
): SparklinePathData {
  const {
    width = 100,
    viewHeight = 20,
    padding = 2.0,
  } = options;

  // Filter out nulls for min/max calculation
  const validNumbers = numbers.filter((n): n is number => n !== null);

  if (validNumbers.length === 0) {
    return {
      pathData: "",
      isolatedPoints: [],
      hasLines: false,
      viewBox: { width, height: viewHeight },
    };
  }

  const minVal = Math.min(...validNumbers);
  const maxVal = Math.max(...validNumbers);
  const valueRange = maxVal - minVal;
  const plotHeight = viewHeight - 2 * padding;

  // Calculate x-coordinates for all positions (including nulls)
  const xCoords = numbers.map((_, i) =>
    numbers.length === 1 ? width / 2 : (i * width) / (numbers.length - 1)
  );

  // Helper to scale a value to y-coordinate
  const scaleY = (val: number): number => {
    if (valueRange === 0) {
      return viewHeight / 2;
    }
    return viewHeight - (((val - minVal) / valueRange) * plotHeight + padding);
  };

  // Build path data with M commands for each segment
  const commands: string[] = [];
  let inSegment = false;

  for (let i = 0; i < numbers.length; i++) {
    const val = numbers[i];
    if (val === null) {
      inSegment = false;
      continue;
    }

    const x = xCoords[i];
    const y = scaleY(val);

    if (!inSegment) {
      // Start a new segment with M command
      commands.push(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
      inSegment = true;
    } else {
      // Continue segment with L command
      commands.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
  }

  // Track which points are part of line segments vs isolated
  const cmdIndexToDataIndex: number[] = [];
  for (let i = 0; i < numbers.length; i++) {
    if (numbers[i] !== null) {
      cmdIndexToDataIndex.push(i);
    }
  }

  const pointInLine = new Set<number>();
  let lastMIndex = -1;

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    if (cmd.startsWith("M")) {
      lastMIndex = i;
    } else if (cmd.startsWith("L") && lastMIndex >= 0) {
      // This L command connects the point at lastMIndex to this point
      pointInLine.add(cmdIndexToDataIndex[lastMIndex]);
      pointInLine.add(cmdIndexToDataIndex[i]);
      lastMIndex = i;
    }
  }

  const hasLines = commands.some((cmd) => cmd.startsWith("L"));

  // Collect isolated points
  const isolatedPoints: Array<{ x: number; y: number }> = [];
  const radius = Math.max(1.5, options.lineWidth ?? 1.0);

  for (let i = 0; i < numbers.length; i++) {
    const val = numbers[i];
    if (val === null) continue;

    // Check if this point is isolated (not part of a line segment)
    const isIsolated = !hasLines || !pointInLine.has(i);

    if (isIsolated) {
      let x = xCoords[i];
      let y = scaleY(val);

      // Clamp coordinates to keep circles fully visible within viewBox
      const margin = 0.5;
      x = Math.max(radius + margin, Math.min(width - radius - margin, x));
      y = Math.max(radius + margin, Math.min(viewHeight - radius - margin, y));

      isolatedPoints.push({ x, y });
    }
  }

  return {
    pathData: commands.join(" "),
    isolatedPoints,
    hasLines,
    viewBox: { width, height: viewHeight },
  };
}

/**
 * Generate an inline SVG sparkline string optimized for embedding within paragraph text.
 *
 * The resulting SVG has no fixed pixel height attribute; instead, it uses CSS `height: 2.0ex`
 * to scale naturally with the surrounding font size. This minimizes layout disruption in
 * Markdown renderers such as Obsidian.
 *
 * @param numbers - Sequence of numeric values to plot (null values create gaps)
 * @param options - Configuration options
 * @param options.width - Width of the SVG in pixels (default: 100)
 * @param options.color - Stroke color in CSS format (default: "currentColor")
 * @param options.lineWidth - Thickness of the line (default: 1.0)
 * @param options.viewHeight - Height of the viewBox coordinate system (default: 20)
 * @param options.padding - Vertical padding inside the viewBox (default: 2.0 units)
 * @param options.lineCap - Line cap style: butt, round, square (default: round)
 * @param options.lineJoin - Line join style: miter, round, bevel (default: round)
 * @param options.dashArray - Dash pattern for dashed lines (default: solid)
 * @returns Complete SVG string (single line, no newlines) suitable for inline HTML/Markdown
 */
export function sparkline(
  numbers: Array<number | null>,
  options: SparklineOptions = {}
): string {
  const {
    width = 100,
    color = "currentColor",
    lineWidth = 1.0,
    lineCap = "round",
    lineJoin = "round",
    dashArray,
  } = options;

  const { pathData, isolatedPoints, hasLines, viewBox } = generateSparklinePathData(
    numbers,
    options
  );

  // Build circles SVG for isolated points
  const circlesSvg = isolatedPoints
    .map(
      (p) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${Math.max(
          1.5,
          lineWidth
        )}" fill="${color}"/>`
    )
    .join("");

  // Build path SVG if we have line data
  const pathSvg =
    pathData || hasLines
      ? `<path d="${pathData}" fill="none" stroke="${color}" stroke-width="${lineWidth}" ` +
        `stroke-linecap="${lineCap}" stroke-linejoin="${lineJoin}"` +
        (dashArray ? ` stroke-dasharray="${dashArray}"` : "") +
        `/>`
      : "";

  // Construct compact inline SVG
  const svg =
    `<svg viewBox="0 0 ${viewBox.width} ${viewBox.height}" ` +
    `width="${width}" ` +
    `style="height:2.0ex; vertical-align:middle; margin:0 0.3em;" ` +
    `preserveAspectRatio="xMidYMid meet">` +
    pathSvg +
    circlesSvg +
    `</svg>`;

  return svg;
}

/**
 * Set option value, handling type conversion and multiple key aliases.
 * This is shared between CLI and Obsidian plugin.
 */
export function setOption(
  options: SparklineOptions,
  key: string,
  value: string
): void {
  const normalizedKey = key.toLowerCase();

  switch (normalizedKey) {
    case "color":
      options.color = value;
      break;
    case "width":
      options.width = parseInt(value, 10);
      break;
    case "line-width":
    case "linewidth":
      options.lineWidth = parseFloat(value);
      break;
    case "view-height":
    case "viewheight":
      options.viewHeight = parseInt(value, 10);
      break;
    case "padding":
      options.padding = parseFloat(value);
      break;
    case "cap":
    case "linecap":
    case "line-cap":
    case "stroke-linecap":
      options.lineCap = value as "butt" | "round" | "square";
      break;
    case "join":
    case "linejoin":
    case "line-join":
    case "stroke-linejoin":
      options.lineJoin = value as "miter" | "round" | "bevel";
      break;
    case "dash":
    case "dasharray":
    case "dash-array":
    case "stroke-dasharray":
      options.dashArray = value;
      break;
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): SparklineOptions & { numbers: Array<number | null> } {
  const numbers: Array<number | null> = [];
  const options: SparklineOptions = {
    width: 100,
    color: "red",
    lineWidth: 1.0,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--width" && i + 1 < args.length) {
      options.width = parseInt(args[i + 1], 10);
      i += 2;
    } else if (arg === "--color" && i + 1 < args.length) {
      options.color = args[i + 1];
      i += 2;
    } else if (arg === "--line-width" && i + 1 < args.length) {
      options.lineWidth = parseFloat(args[i + 1]);
      i += 2;
    } else if (arg === "--view-height" && i + 1 < args.length) {
      options.viewHeight = parseInt(args[i + 1], 10);
      i += 2;
    } else if (arg === "--padding" && i + 1 < args.length) {
      options.padding = parseFloat(args[i + 1]);
      i += 2;
    } else if (arg === "--line-cap" && i + 1 < args.length) {
      options.lineCap = args[i + 1] as "butt" | "round" | "square";
      i += 2;
    } else if (arg === "--line-join" && i + 1 < args.length) {
      options.lineJoin = args[i + 1] as "miter" | "round" | "bevel";
      i += 2;
    } else if (arg === "--dash-array" && i + 1 < args.length) {
      options.dashArray = args[i + 1];
      i += 2;
    } else if (!arg.startsWith("--")) {
      // Check for null markers (case insensitive)
      if (/^(null|none|nil|undefined|na|n\/a)$/i.test(arg)) {
        numbers.push(null);
      } else {
        const num = parseFloat(arg);
        if (!isNaN(num)) {
          numbers.push(num);
        }
      }
      i++;
    } else {
      i++;
    }
  }

  return { numbers, ...options };
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
  numbers           One or more numbers to plot (use "null" for gaps)

Options:
  --width <n>       Width of the SVG in pixels (default: 100)
  --color <s>       Stroke color in CSS format (default: red)
  --line-width <n>  Thickness of the line (default: 1.0)
  --view-height <n> Height of the viewBox coordinate system (default: 20)
  --padding <n>     Vertical padding inside the viewBox (default: 2.0)
  --line-cap <s>    Line cap style: butt, round, square (default: round)
  --line-join <s>   Line join style: miter, round, bevel (default: round)
  --dash-array <s>  Dash pattern for dashed lines (e.g., "5,3")
  --help, -h        Show this help message

Examples:
  npx ts-node sparkline.ts 1 2 3 4 5
  npx ts-node sparkline.ts 1 2 null 4 5 --width 200 --color blue --line-width 2.0
  npx ts-node sparkline.ts 1 2 3 4 5 --dash-array "5,3" --line-cap square
`);
    return;
  }

  const { numbers, ...options } = parseArgs(args);

  if (numbers.length === 0 || numbers.every((n) => n === null)) {
    console.error("Error: At least one numeric value is required");
    process.exit(1);
  }

  const svg = sparkline(numbers, options);
  process.stdout.write(svg + "\n");
}

// Only run CLI when executed directly (not when imported)
if (typeof process !== "undefined" && process.argv[1]?.endsWith("sparkline.ts")) {
  main();
}
