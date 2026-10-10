import type {Route} from "./+types/home";
import {HandTrackPage} from "~/pages/hand-track-page";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "HandSpeak - Tradutor de Libras em Tempo Real" },
    {
      name: "description",
      content:
        "Tradução bidirecional inteligente entre Libras e Português falado com IA Google Gemini.",
    },
  ];
}

export default function Home() {
  return <HandTrackPage/>;
}
