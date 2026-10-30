import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { MemoryScene, type SceneKind } from "../Illustration";
import { Reveal, SectionIntro } from "../ui";
import { PEOPLE, type PersonId } from "./model";

/**
 * Fictional family albums on the public homepage: the same people as the
 * recognition demo (Ruth and Daniel), drawn as illustrations — no
 * photographs of real people, no backend, nothing stored.
 */
export interface DemoPhoto {
  title: string;
  story: string;
  when: string;
  scene: SceneKind;
  with: PersonId;
}

export interface DemoAlbum {
  id: string;
  title: string;
  description: string;
  photos: DemoPhoto[];
}

export const DEMO_ALBUMS: DemoAlbum[] = [
  {
    id: "cornwall",
    title: "Cornwall summers",
    description: "Holidays by the sea with Ruth, and the recipes that came home with you.",
    photos: [
      {
        title: "The beach at St Ives",
        story: "Ruth built a sandcastle every morning and named each one after a cousin.",
        when: "August 1983",
        scene: "seaside",
        with: "ruth",
      },
      {
        title: "Lemon drizzle lesson",
        story: PEOPLE.ruth.memory.story,
        when: PEOPLE.ruth.memory.when,
        scene: "kitchen",
        with: "ruth",
      },
      {
        title: "Ruth's fortieth",
        story: "The whole family squeezed into your kitchen, and Ruth cut the cake you had baked together.",
        when: "May 2014",
        scene: "birthday",
        with: "ruth",
      },
    ],
  },
  {
    id: "daniel",
    title: "Days with Daniel",
    description: "Your grandson growing up, from the strawberry farm to his first concert.",
    photos: [
      {
        title: PEOPLE.daniel.memory.title,
        story: PEOPLE.daniel.memory.story,
        when: PEOPLE.daniel.memory.when,
        scene: "garden",
        with: "daniel",
      },
      {
        title: "Rock pools",
        story: "Daniel found a crab the size of his hand and insisted on showing it to everyone on the beach.",
        when: "Summer 2011",
        scene: "seaside",
        with: "daniel",
      },
      {
        title: "Daniel turns eighteen",
        story: "He played the piano for you after the cake, the piece he is still practising today.",
        when: "March 2019",
        scene: "birthday",
        with: "daniel",
      },
    ],
  },
];

export function DemoAlbums() {
  const [albumIndex, setAlbumIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const album = DEMO_ALBUMS[albumIndex];
  const photo = album.photos[photoIndex];
  const person = PEOPLE[photo.with];
  const openAlbum = (i: number) => {
    setAlbumIndex(i);
    setPhotoIndex(0);
  };
  const step = (d: number) => setPhotoIndex((i) => (i + d + album.photos.length) % album.photos.length);

  return (
    <section aria-labelledby="albums" className="bg-cream py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionIntro id="albums" eyebrow="Family albums" title="Photos with the stories behind them">
              Caregivers collect family photos into albums and write the story behind each one. The patient browses
              them, by album or by person. Here, the family is fictional and every picture is an illustration.
            </SectionIntro>
            <p className="inline-flex items-center gap-2 rounded-full border-2 border-plum bg-mint px-4 py-2 text-sm font-bold uppercase tracking-wider text-plum-700">
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
              Fictional family · illustrations
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="space-y-4">
            <h3 className="font-body text-sm font-semibold uppercase tracking-wider text-moss">Albums</h3>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {DEMO_ALBUMS.map((a, i) => (
                <li key={a.id}>
                  <button
                    type="button"
                    aria-pressed={i === albumIndex}
                    onClick={() => openAlbum(i)}
                    className={cn(
                      "w-full rounded-3xl border-2 p-5 text-left transition-colors",
                      i === albumIndex ? "border-forest bg-mint" : "border-forest/15 bg-cream hover:border-forest/40",
                    )}
                  >
                    <span className="block font-display text-2xl text-deep">{a.title}</span>
                    <span className="mt-1 block text-[15px] text-moss">{a.description}</span>
                    <span className="mt-2 block text-sm font-semibold text-forest">{a.photos.length} pictures</span>
                  </button>
                </li>
              ))}
            </ul>
            <ul aria-label={`Pictures in ${album.title}`} className="grid grid-cols-3 gap-3">
              {album.photos.map((p, i) => (
                <li key={p.title}>
                  <button
                    type="button"
                    aria-pressed={i === photoIndex}
                    aria-label={`Show ${p.title}`}
                    onClick={() => setPhotoIndex(i)}
                    className={cn(
                      "block w-full overflow-hidden rounded-2xl border-2",
                      i === photoIndex ? "border-forest" : "border-transparent hover:border-forest/40",
                    )}
                  >
                    <span className="block aspect-[8/5]">
                      <MemoryScene scene={p.scene} companion={p.with} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <figure className="overflow-hidden rounded-3xl border border-forest/15 bg-mint shadow-lift">
            <div className="aspect-[8/5]">
              <MemoryScene scene={photo.scene} companion={photo.with} title={`Illustration: ${photo.title}`} />
            </div>
            <figcaption className="space-y-3 p-6 sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-wider text-moss">
                {photo.when} · with {person.name}, {person.relationship.toLowerCase()}
              </p>
              <h3 className="font-display text-3xl text-deep">{photo.title}</h3>
              <p className="text-lg text-deep">{photo.story}</p>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <p className="text-sm text-moss" aria-live="polite">
                  Picture {photoIndex + 1} of {album.photos.length}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    className="inline-flex min-h-11 items-center gap-1 rounded-full border border-forest/30 px-4 font-semibold text-forest hover:border-forest"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    className="inline-flex min-h-11 items-center gap-1 rounded-full bg-forest px-4 font-semibold text-cream hover:bg-deep"
                  >
                    Next
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
