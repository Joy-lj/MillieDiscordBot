export const workConfig = {
    workCooldown: 30 * 60 * 1000,
    outcomes: [
    {
      weight: 45,
      min: 200,
      max: 700,
      message: "You scanned tickets at the festival entrance.",
    },
    {
      weight: 25,
      min: 600,
      max: 800,
      message: "You scooped Millie's litterbox and cleaned the cat tree.",
    },
    {
      weight: 15,
      min: 900,
      max: 1500,
      message: "You caught a large Bluefin Tuna!",
    },
    {
      weight: 5,
      min: 2000,
      max: 3500,
      message: "You saved a cat from a tree and became a local hero!",
    },
    {
      weight: 5,
      min: 0,
      max: 0,
      message: "You failed to find any work today. Better luck next time!",
    }
  ],

}