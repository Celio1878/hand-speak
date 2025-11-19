import type {Route} from "./+types/home";
import {HandTrackPage} from "~/pages/hand-track-page";

export function meta({}: Route.MetaArgs) {
  return [
    {title: "Hand's Speak"},
    {name: "description", content: "Translate hand signs to text."},
  ];
}

export default function Home() {
  return <HandTrackPage/>;
}
