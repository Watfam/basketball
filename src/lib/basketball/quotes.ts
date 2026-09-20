/**
 * Short, well-known basketball quotes shown on the player hub — the same
 * "training manual" energy the original offseason manual had, not
 * generic motivational filler. One is picked at random per page load.
 */
export const QUOTES = [
  { text: "The moment you give up is the moment you let someone else win.", author: "Kobe Bryant" },
  { text: "I've failed over and over and over again in my life. And that is why I succeed.", author: "Michael Jordan" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "It's not whether you get knocked down, it's whether you get up.", author: "Vince Lombardi" },
  { text: "Great players are willing to give up their personal achievement for the achievement of the group.", author: "Kareem Abdul-Jabbar" },
  { text: "Do you know what makes me the best player in the world? I never quit. I never give up.", author: "Kobe Bryant" },
  { text: "Success is not an accident. It is hard work, perseverance, learning, studying, sacrifice.", author: "Pele" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "Confidence comes from being prepared.", author: "John Wooden" },
  { text: "It's what you learn after you know it all that counts.", author: "John Wooden" },
  { text: "The mind is the limit. As long as the mind can envision the fact that you can do something, you can do it.", author: "Arnold Schwarzenegger" },
  { text: "Talent wins games, but teamwork and intelligence win championships.", author: "Michael Jordan" },
] as const;

export function randomQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}
