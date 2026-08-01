"use client";

import { Button } from "@/components/ui/button";
import React from "react";

export function Header26() {
  return (
    <section className="px-[5%] py-16 md:py-24 lg:py-28 scheme-1 badge-alt alternate logo-alt">
      <div className="container flex flex-col items-center text-center">
        <div className="mb-12 md:mb-18 lg:mb-20">
          <div className="mx-auto w-full max-w-lg">
            <h1 className="mb-5 text-h1 font-bold md:mb-6">Aujourd'hui</h1>
            <p className="text-medium">MARDI · 12 AOÛT</p>
            <div className="mt-6 flex items-center justify-center gap-x-4 md:mt-8">
              <Button title="Nouveau bloc">Nouveau bloc</Button>
              <Button title="Voir planning" variant="secondary">
                Voir planning
              </Button>
            </div>
          </div>
        </div>
        <div className="w-full">
          <img
            src="https://d22po4pjz3o32e.cloudfront.net/placeholder-image-landscape.svg"
            className="aspect-video size-full rounded-image object-cover"
            alt="Relume placeholder image"
          />
        </div>
      </div>
    </section>
  );
}
