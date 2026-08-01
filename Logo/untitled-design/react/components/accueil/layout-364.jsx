"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import React from "react";
import { ChevronRight } from "relume-icons";

export function Layout364() {
  return (
    <section className="px-[5%] py-16 md:py-24 lg:py-28 scheme-1 badge-alt alternate logo-alt">
      <div className="container">
        <div className="mb-12 md:mb-18 lg:mb-20">
          <div className="mx-auto max-w-lg text-center">
            <p className="mb-3 font-semibold md:mb-4">Légende</p>
            <h2 className="mb-5 text-h2 font-bold md:mb-6">
              Le fil de l'heure
            </h2>
            <p className="text-medium">
              Chaque bloc trouve sa place dans la mécanique du jour.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 md:gap-8">
          <Card className="p-6 md:p-8 lg:p-12">
            <div>
              <div className="mb-5 md:mb-6">
                <img
                  className="size-12 text-scheme-text"
                  src="https://cdn.jsdelivr.net/npm/@material-symbols/svg-500@latest/rounded/schedule.svg"
                />
              </div>
              <h3 className="mb-5 text-h3 font-bold md:mb-6">
                Légende du jour
              </h3>
              <p>
                Le déroulement précis de vos heures, bloc après bloc. La ligne
                active marque le présent.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-4 md:mt-8">
              <Button variant="secondary">Modifier</Button>
              <Button
                iconRight={<ChevronRight className="text-scheme-text" />}
                variant="link"
                size="link"
              >
                Voir
              </Button>
            </div>
          </Card>
          <Card className="p-6 md:p-8 lg:p-12">
            <div>
              <div className="mb-5 md:mb-6">
                <img
                  className="size-12 text-scheme-text"
                  src="https://cdn.jsdelivr.net/npm/@material-symbols/svg-500@latest/rounded/automation.svg"
                />
              </div>
              <h3 className="mb-5 text-h3 font-bold md:mb-6">
                Blocs planifiés
              </h3>
              <p>
                Les tâches et objectifs placés automatiquement par le moteur.
                Chaque chose à sa juste place.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-4 md:mt-8">
              <Button variant="secondary">Modifier</Button>
              <Button
                iconRight={<ChevronRight className="text-scheme-text" />}
                variant="link"
                size="link"
              >
                Voir
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
