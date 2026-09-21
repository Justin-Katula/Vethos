"use client"

import React from "react";
import { Header26 } from "@/components/accueil/header-26";
import { Layout22 } from "@/components/accueil/layout-22";
import { Layout364 } from "@/components/accueil/layout-364";
import { Layout485 } from "@/components/accueil/layout-485";
import { Cta40 } from "@/components/accueil/cta-40";


export default function Page() {
  return (
    <div>
      <Header26 />
      <Layout22 />
      <Layout364 />
      <Layout485 />
      <Cta40 />
    </div>
  );
}
