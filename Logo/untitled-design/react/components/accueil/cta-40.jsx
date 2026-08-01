"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import React from "react";

export function Cta40() {
  return (
    <section className="px-[5%] py-16 md:py-24 lg:py-28 scheme-1 badge-alt alternate logo-alt">
      <div className="container">
        <Card className="grid auto-cols-fr grid-cols-1 lg:grid-cols-2">
          <div className="flex flex-col justify-center p-8 md:p-12">
            <h2 className="mb-5 text-h2 font-bold md:mb-6">
              Pose ta première règle
            </h2>
            <p className="text-medium">
              Le cadran attend. Configurez votre moteur de planification pour
              que les blocs trouvent leur place.
            </p>
            <div className="mt-6 w-full max-w-sm md:mt-8">
              <form className="mb-4 grid w-full max-w-sm grid-cols-1 gap-y-3 sm:grid-cols-[1fr_max-content] sm:gap-4">
                <Input id="email" type="email" placeholder="Votre email" />
                <Button
                  title="Commencer"
                  size="sm"
                  className="items-center justify-center px-6 py-3"
                >
                  Commencer
                </Button>
              </form>
              <p className="text-tiny">
                En cliquant, vous acceptez nos conditions générales et notre
                politique de confidentialité.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center">
            <img
              src="https://d22po4pjz3o32e.cloudfront.net/placeholder-image-landscape.svg"
              className="size-full object-cover"
              alt="Relume placeholder image"
            />
          </div>
        </Card>
      </div>
    </section>
  );
}
