import type { Metadata } from "next";
import SharedAddress from "@/components/share/SharedAddress";
export const metadata:Metadata={title:"Shared Address",robots:{index:false,follow:false},referrer:"no-referrer"};
export default function SharePage(){return <SharedAddress/>;}
