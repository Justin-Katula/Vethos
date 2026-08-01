"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import React, { useState } from "react";
import {
  FacebookLogo,
  InstagramLogo,
  LinkedinLogo,
  XLogo,
  YoutubeLogo,
} from "relume-icons";

const useForm = () => {
  const [email, setEmail] = useState("");
  const handleSetEmail = (event) => {
    setEmail(event.target.value);
  };
  const handleSubmit = (event) => {
    event.preventDefault();
    console.log({ email });
  };
  return {
    email,
    handleSetEmail,
    handleSubmit,
  };
};

export function Footer16() {
  const formState = useForm();
  return (
    <footer className="px-[5%] py-12 md:py-18 lg:py-20 scheme-1 badge-alt alternate logo-alt">
      <div className="container">
        <div className="grid grid-cols-1 gap-x-[8vw] gap-y-12 pb-8 md:gap-y-16 md:pb-10 lg:grid-cols-[0.75fr_1fr] lg:gap-y-4 lg:pb-12">
          <div className="flex flex-col">
            <a href="#" className="mb-5 md:mb-6">
              <img
                src="https://d22po4pjz3o32e.cloudfront.net/logo-image.svg"
                alt="Logo image"
                className="inline-block"
              />
            </a>
            <p className="mb-5 md:mb-6">
              Recevez les mises à jour de Nexus. Pas de bruit, seulement la
              précision.
            </p>
            <div className="w-full max-w-md">
              <form
                className="mb-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-[1fr_max-content] md:gap-y-4"
                onSubmit={formState.handleSubmit}
              >
                <Input
                  id="email"
                  type="email"
                  placeholder="Votre email"
                  value={formState.email}
                  onChange={formState.handleSetEmail}
                />
                <Button title="S'abonner" variant="secondary" size="sm">
                  S'abonner
                </Button>
              </form>
              <p className="text-tiny">
                En vous abonnant, vous acceptez notre politique de
                confidentialité.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 items-start gap-y-10 sm:grid-cols-3 sm:gap-x-6 md:gap-x-8 md:gap-y-4">
            <div className="flex flex-col items-start justify-start">
              <h2 className="mb-3 font-semibold md:mb-4">Produit</h2>
              <ul className="flex flex-col items-start">
                <li className="text-small py-2">
                  <a href="#" className="flex items-center gap-3">
                    <span>Accueil</span>
                  </a>
                </li>
                <li className="text-small py-2">
                  <a href="#" className="flex items-center gap-3">
                    <span>Tâches</span>
                  </a>
                </li>
                <li className="text-small py-2">
                  <a href="#" className="flex items-center gap-3">
                    <span>Objectifs</span>
                  </a>
                </li>
                <li className="text-small py-2">
                  <a href="#" className="flex items-center gap-3">
                    <span>Planification</span>
                  </a>
                </li>
                <li className="text-small py-2">
                  <a href="#" className="flex items-center gap-3">
                    <span>Réglages</span>
                  </a>
                </li>
              </ul>
            </div>
            <div className="flex flex-col items-start justify-start">
              <h2 className="mb-3 font-semibold md:mb-4">Ressources</h2>
              <ul className="flex flex-col items-start">
                <li className="text-small py-2">
                  <a href="#" className="flex items-center gap-3">
                    <span>Blog</span>
                  </a>
                </li>
                <li className="text-small py-2">
                  <a href="#" className="flex items-center gap-3">
                    <span>Guide</span>
                  </a>
                </li>
                <li className="text-small py-2">
                  <a href="#" className="flex items-center gap-3">
                    <span>API</span>
                  </a>
                </li>
                <li className="text-small py-2">
                  <a href="#" className="flex items-center gap-3">
                    <span>Statut</span>
                  </a>
                </li>
                <li className="text-small py-2">
                  <a href="#" className="flex items-center gap-3">
                    <span>Support</span>
                  </a>
                </li>
              </ul>
            </div>
            <div className="flex flex-col items-start justify-start">
              <h2 className="mb-3 font-semibold md:mb-4">Nous suivre</h2>
              <ul className="flex flex-col items-start">
                <li className="text-small py-2">
                  <a href="#" className="flex items-center gap-3">
                    <FacebookLogo className="size-6 text-scheme-text" />
                    <span>Facebook</span>
                  </a>
                </li>
                <li className="text-small py-2">
                  <a href="#" className="flex items-center gap-3">
                    <InstagramLogo className="size-6 text-scheme-text" />
                    <span>Instagram</span>
                  </a>
                </li>
                <li className="text-small py-2">
                  <a href="#" className="flex items-center gap-3">
                    <XLogo className="size-6 p-0.5 text-scheme-text" />
                    <span>X</span>
                  </a>
                </li>
                <li className="text-small py-2">
                  <a href="#" className="flex items-center gap-3">
                    <LinkedinLogo className="size-6 text-scheme-text" />
                    <span>LinkedIn</span>
                  </a>
                </li>
                <li className="text-small py-2">
                  <a href="#" className="flex items-center gap-3">
                    <YoutubeLogo className="size-6 text-scheme-text" />
                    <span>Youtube</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="pb-8 md:pb-10 lg:pb-12">
          <a href="#">
            <img
              src="https://d22po4pjz3o32e.cloudfront.net/company-name.svg"
              alt="Company logo"
              className="inline-block"
            />
          </a>
        </div>
        <div className="h-px w-full bg-scheme-border" />
        <div className="text-small flex flex-col-reverse items-start justify-between pt-6 pb-4 md:flex-row md:items-center md:pt-8 md:pb-0">
          <p className="mt-6 md:mt-0">© 2025 Nexus. Tous droits réservés.</p>
          <ul className="text-small grid grid-flow-row grid-cols-[max-content] justify-center gap-y-4 md:grid-flow-col md:gap-x-6 md:gap-y-0">
            <li className="underline">
              <a href="#">Confidentialité</a>
            </li>
            <li className="underline">
              <a href="#">Conditions d'utilisation</a>
            </li>
            <li className="underline">
              <a href="#">Cookies</a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
