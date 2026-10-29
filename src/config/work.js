export const workConfig = {
    workCooldown: 30 * 60 * 1000,
    outcomes: [
    {
      weight: 45,
      min: 500,
      max: 1000,
      message: "You scanned tickets at the festival entrance.",
    },
    {
      weight: 25,
      min: 1001,
      max: 2500,
      message: "You scooped Millie's litterbox and cleaned the cat tree.",
    },
    {
      weight: 15,
      min: 2501,
      max: 3500,
      message: "You caught a large Bluefin Tuna!",
    },
    {
      weight: 5,
      min: 3501,
      max: 5000,
      message: "You saved a cat from a tree and became a local hero!",
    },
    {
      weight: 3,
      min: 0,
      max: 0,
      message: "You failed to find any work today. Better luck next time!",
    },
    {
      weight: 2,
      min: 5001,
      max: 10000,
      message: "You saved Millie from danger, now it cost Joy her net worth."
    }
  ],

}