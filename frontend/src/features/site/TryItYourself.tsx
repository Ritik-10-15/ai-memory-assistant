import { Link } from "react-router-dom";
import { LogIn, Sparkles } from "lucide-react";
import { Reveal, SectionIntro } from "./ui";

/** Sandbox deployments only: an invitation to use the real app with a fictional family. */
export function TryItYourself() {
  return (
    <section aria-labelledby="try-it" className="bg-mint py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-8 rounded-[2rem] border-2 border-forest/15 bg-cream p-8 sm:p-12">
            <SectionIntro id="try-it" eyebrow="Try it yourself" title="Use the real app, with your own private copy">
              Sign up in seconds — no email needed — and explore the caregiver workspace and the patient screen with a
              fictional family. Add your own face to see live recognition with your webcam. Your copy is private and
              deleted automatically after 7 days.
            </SectionIntro>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/signup"
                className="inline-flex min-h-[3.25rem] items-center gap-2 rounded-full bg-forest px-6 text-lg font-semibold text-cream hover:bg-deep"
              >
                <Sparkles className="h-5 w-5" aria-hidden="true" />
                Create a free sandbox
              </Link>
              <Link
                to="/signin"
                className="inline-flex min-h-[3.25rem] items-center gap-2 rounded-full border-2 border-forest/30 px-6 text-lg font-semibold text-forest hover:border-forest"
              >
                <LogIn className="h-5 w-5" aria-hidden="true" />
                Sign in
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
