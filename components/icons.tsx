import { cn } from "@/lib/utils";

type SvgPropsWithoutViewBox = Omit<
  React.ComponentProps<"svg">,
  "viewBox" | "xmlns" | "children"
>;

const LOGO_VIEWBOX_WIDTH = 1440;
const LOGO_VIEWBOX_HEIGHT = 1080;
const LOGO_ASPECT = LOGO_VIEWBOX_HEIGHT / LOGO_VIEWBOX_WIDTH;

export type LogoProps = SvgPropsWithoutViewBox & {
  /**
   * Default width in pixels when `width` / `height` are not set.
   * Height follows the 4:3 viewBox unless `height` is set explicitly.
   */
  size?: number;
  /** Fill for the mark paths and bottom square. Defaults to `currentColor` for Tailwind `text-*` control. */
  fill?: string;
  /** Optional full-bleed background inside the viewBox (e.g. `#f2f2f2` for the source artwork). */
  backgroundFill?: string;
};

function Logo({
  size = 32,
  fill = "currentColor",
  backgroundFill,
  className,
  width,
  height,
  "aria-label": ariaLabel,
  role,
  ...props
}: LogoProps) {
  let resolvedWidth: number | string | undefined = width;
  let resolvedHeight: number | string | undefined = height;

  if (resolvedWidth === undefined && resolvedHeight === undefined) {
    resolvedWidth = size;
    resolvedHeight = size * LOGO_ASPECT;
  } else if (
    typeof resolvedWidth === "number" &&
    resolvedHeight === undefined
  ) {
    resolvedHeight = resolvedWidth * LOGO_ASPECT;
  } else if (
    typeof resolvedHeight === "number" &&
    resolvedWidth === undefined
  ) {
    resolvedWidth = resolvedHeight / LOGO_ASPECT;
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${LOGO_VIEWBOX_WIDTH} ${LOGO_VIEWBOX_HEIGHT}`}
      width={resolvedWidth}
      height={resolvedHeight}
      className={cn(className)}
      role={role ?? (ariaLabel ? "img" : undefined)}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      {...props}
    >
      {backgroundFill ? (
        <rect
          width={LOGO_VIEWBOX_WIDTH}
          height={LOGO_VIEWBOX_HEIGHT}
          fill={backgroundFill}
        />
      ) : null}
      <path d="M523 378H704V438H584V499H704V559H523Z" fill={fill} />
      <path d="M644 438H884V620H644V559H824V499H704V438Z" fill={fill} />
      <rect x="523" y="620" width="61" height="60" fill={fill} />
    </svg>
  );
}

export { Logo };
