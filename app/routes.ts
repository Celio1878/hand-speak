import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/gemini", "routes/api.gemini.ts"),
] satisfies RouteConfig;
