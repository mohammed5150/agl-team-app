export const P12 = [
  ["O","O","M","M","O","O","N","N"],
  ["M","M","O","O","M","M","O","O"],
  ["N","N","O","O","N","N","O","O"],
  ["O","O","N","N","O","O","M","M"]
];
export const P8  = [["M","M","M","M","M","M","O"], ["M","M","M","M","M","O","M"]];
export const PHD = [
  ["N","N","O","O","N","N","O","O"],
  ["O","O","N","N","O","O","M","M"],
  ["M","O","M","M","O","O","N","N"]
];
export const PSY = [
  ["M","M","M","O","O","M","M","N","N","O","O","M","M","N","N"],
  ["N","O","O","M","M","N","N","O","O","M","M","N","N","O","O"]
];

export const gR = (s, p, y, m) => {
  const d = new Date(y, m+1, 0).getDate();
  return Array.from({length:d}, (_,i) => ({
    day: i+1,
    code: p[i % p.length],
    date: `${y}-${String(m+1).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`
  }));
};
