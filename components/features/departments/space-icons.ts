import {
  Boxes,
  Briefcase,
  Building2,
  Camera,
  Clapperboard,
  Code2,
  Compass,
  Film,
  FlaskConical,
  Gauge,
  Globe,
  GraduationCap,
  Handshake,
  Headphones,
  Layers,
  LifeBuoy,
  Megaphone,
  Mic,
  Music,
  Palette,
  PenTool,
  Rocket,
  Scissors,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Video,
  Wand2,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

// The icons a space can wear. An explicit map rather than a dynamic import
// so the bundler can see exactly which of lucide's several hundred icons are
// reachable, and so an unknown value in the database can never blow up a
// render: SpaceGlyph simply falls through to drawing the value as text.
//
// Names are the lucide kebab names, which is what departments.icon stores.
// Keep this list short. A picker with two hundred icons is a worse picker.
export const SPACE_ICONS: Record<string, LucideIcon> = {
  megaphone: Megaphone,
  "trending-up": TrendingUp,
  handshake: Handshake,
  target: Target,
  video: Video,
  clapperboard: Clapperboard,
  film: Film,
  camera: Camera,
  scissors: Scissors,
  "wand-2": Wand2,
  palette: Palette,
  "pen-tool": PenTool,
  sparkles: Sparkles,
  music: Music,
  mic: Mic,
  headphones: Headphones,
  "building-2": Building2,
  briefcase: Briefcase,
  users: Users,
  "graduation-cap": GraduationCap,
  "life-buoy": LifeBuoy,
  "settings-2": Settings2,
  wrench: Wrench,
  "code-2": Code2,
  rocket: Rocket,
  zap: Zap,
  globe: Globe,
  compass: Compass,
  gauge: Gauge,
  layers: Layers,
  boxes: Boxes,
  "flask-conical": FlaskConical,
};

export const SPACE_ICON_NAMES = Object.keys(SPACE_ICONS);

export function spaceIconFor(value: string | null): LucideIcon | null {
  if (!value) return null;
  return SPACE_ICONS[value] ?? null;
}
