// Every adventure lives here. Adding a theme is one entry: the form, the story prompt, the
// template fallback, the outfit and the illustration setting all read from this registry.

export type Outfit = { pt: string; en: string };

export type Theme = {
  id: string;
  name: string;
  description: string;
  // Used in the fallback title "Lucas e {titleTail}" and in the story prompt as a hint.
  titleTail: string;
  colors: { from: string; to: string; ink: string };
  // English, for image prompts.
  setting: string;
  outfits: Outfit[];
  // Slots for the template story, written so they fit after "a"/"o" without gendered words about the child.
  slots: {
    place: string;
    portal: string;
    friend: string;
    friendEn: string;
    treasure: string;
    problem: string;
    obstacle: string;
    home: string;
  };
};

export const THEMES = {
  dinossauros: {
    id: "dinossauros",
    name: "Dinossauros",
    description: "Uma aventura por uma ilha cheia de criaturas incríveis.",
    titleTail: "a Ilha dos Dinossauros",
    colors: { from: "#F6D58E", to: "#8DBF8B", ink: "#2F4A2B" },
    setting: "a lush prehistoric island with giant ferns, friendly round dinosaurs, warm volcano glow in the distance",
    outfits: [
      { pt: "camiseta amarela, bermuda verde-oliva e tênis vermelhos", en: "a mustard-yellow t-shirt, olive-green shorts, red sneakers and a small orange backpack" },
      { pt: "camiseta laranja, bermuda cáqui e botinhas marrons", en: "an orange t-shirt, khaki explorer shorts, brown little boots and a green explorer hat" },
    ],
    slots: {
      place: "uma ilha onde os dinossauros ainda passeiam",
      portal: "um ovo enorme e brilhante que apareceu no quintal",
      friend: "um pequeno tricerátopo chamado Pipoca",
      friendEn: "a small cheerful baby triceratops with a mint-green body",
      treasure: "uma folha dourada que faz as plantas crescerem",
      problem: "o grande rio secou e os dinossauros estão com sede",
      obstacle: "uma ponte de cipós balançando sobre um vale",
      home: "o quintal de casa, com o sol se pondo",
    },
  },
  espaco: {
    id: "espaco",
    name: "Espaço",
    description: "Uma missão entre planetas, estrelas e novos amigos.",
    titleTail: "a Missão das Estrelas",
    colors: { from: "#9DB4F2", to: "#2C3E7A", ink: "#1B2350" },
    setting: "outer space with pastel planets, sparkling stars, a cozy round rocket ship and soft nebula colors",
    outfits: [
      { pt: "macacão de astronauta branco com detalhes azuis e tênis amarelos", en: "a white astronaut jumpsuit with sky-blue details, a small star patch and yellow sneakers" },
      { pt: "macacão laranja de astronauta e botas brancas", en: "an orange astronaut jumpsuit, white boots and a round clear helmet carried under the arm" },
    ],
    slots: {
      place: "o espaço, entre planetas coloridos",
      portal: "um foguete de papelão que de repente começou a brilhar",
      friend: "um robozinho chamado Bip",
      friendEn: "a small round friendly robot with a glowing antenna and teal body",
      treasure: "uma estrela cadente perdida",
      problem: "as estrelas de um planeta estão se apagando uma a uma",
      obstacle: "um cinturão de asteroides dançantes",
      home: "a cama quentinha, com estrelas na janela",
    },
  },
  "super-heroi": {
    id: "super-heroi",
    name: "Super-herói",
    description: "A criança descobre que possui uma habilidade especial.",
    titleTail: "o Poder Escondido",
    colors: { from: "#F7A8A0", to: "#E3533F", ink: "#5A1D16" },
    setting: "a colorful friendly city with rounded buildings, rooftop gardens, balloons and a bright sky",
    outfits: [
      { pt: "camiseta azul com uma estrela, capa vermelha e tênis amarelos", en: "a blue t-shirt with a small yellow star, a red cape, comfortable blue pants and yellow sneakers" },
      { pt: "camiseta verde, capa roxa e tênis brancos", en: "a green t-shirt, a purple cape, gray pants and white sneakers" },
    ],
    slots: {
      place: "a cidade, vista lá do alto",
      portal: "uma capa que apareceu dobrada na janela",
      friend: "um passarinho falante chamado Vento",
      friendEn: "a small bright-blue talking bird with round eyes",
      treasure: "o próprio poder especial, escondido no coração",
      problem: "o parque da cidade ficou sem cores",
      obstacle: "um vento forte que espalhou os balões de todo mundo",
      home: "a janela do quarto, com a cidade colorida de novo",
    },
  },
  "reino-magico": {
    id: "reino-magico",
    name: "Reino Mágico",
    description: "Uma aventura por castelos, criaturas mágicas e mistérios.",
    titleTail: "o Reino Encantado",
    colors: { from: "#E7C6F2", to: "#8E6BC8", ink: "#3B2160" },
    setting: "an enchanted kingdom with pastel castles, glowing mushrooms, gentle magical creatures and sparkling paths",
    outfits: [
      { pt: "túnica azul-clara, calça bege e botinhas marrons", en: "a light-blue tunic with a golden belt, beige trousers and soft brown boots" },
      { pt: "colete verde, camisa creme e botas vermelhas", en: "a green vest over a cream shirt, brown trousers and red boots" },
    ],
    slots: {
      place: "um reino de castelos e florestas encantadas",
      portal: "uma porta pequenina que surgiu no tronco de uma árvore",
      friend: "um dragãozinho chamado Faísca",
      friendEn: "a tiny friendly lavender dragon with small wings and big kind eyes",
      treasure: "uma chave de cristal que abre qualquer mistério",
      problem: "a música mágica do reino desapareceu",
      obstacle: "um labirinto de roseiras que muda de lugar",
      home: "o quarto, com um brilho mágico no travesseiro",
    },
  },
  "fundo-do-mar": {
    id: "fundo-do-mar",
    name: "Fundo do Mar",
    description: "Uma jornada por oceanos, peixes e tesouros escondidos.",
    titleTail: "o Tesouro do Oceano",
    colors: { from: "#A8E3E0", to: "#2E8FA3", ink: "#123E4A" },
    setting: "a bright underwater world with coral gardens, friendly fish, sunbeams through clear turquoise water and bubbles",
    outfits: [
      { pt: "roupa de mergulho azul com detalhes amarelos e pés de pato laranja", en: "a blue diving suit with yellow details, orange flippers and a small clear diving mask on the forehead" },
      { pt: "roupa de mergulho verde-água e pés de pato amarelos", en: "a teal diving suit, yellow flippers and a little seashell necklace" },
    ],
    slots: {
      place: "o fundo do mar, entre corais coloridos",
      portal: "uma concha que, encostada no ouvido, chamava pelo nome",
      friend: "uma tartaruguinha chamada Maré",
      friendEn: "a small sea turtle with a teal shell and a gentle smile",
      treasure: "uma pérola que acende a luz do oceano",
      problem: "o recife perdeu o brilho e os peixinhos estão tristes",
      obstacle: "uma corrente marinha que gira como um redemoinho",
      home: "a praia, com os pés na areia quentinha",
    },
  },
  animais: {
    id: "animais",
    name: "Animais",
    description: "Uma aventura em que animais precisam da ajuda da criança.",
    titleTail: "os Amigos da Floresta",
    colors: { from: "#F3D9A4", to: "#C98B4E", ink: "#4A2E14" },
    setting: "a sunny friendly forest with tall trees, flowers, a sparkling stream and cute woodland animals",
    outfits: [
      { pt: "camiseta vermelha, jardineira jeans e botas amarelas", en: "a red t-shirt, denim overalls and yellow rain boots" },
      { pt: "camiseta listrada azul e branca, bermuda verde e tênis laranja", en: "a blue and white striped t-shirt, green shorts and orange sneakers" },
    ],
    slots: {
      place: "uma floresta onde os animais conversam",
      portal: "um esquilo que bateu na janela segurando um bilhete",
      friend: "uma raposinha chamada Canela",
      friendEn: "a small fluffy orange fox cub with a white-tipped tail",
      treasure: "uma semente que faz nascer uma árvore gigante",
      problem: "a ponte do riacho caiu e os filhotes não conseguem voltar para casa",
      obstacle: "um riacho de pedras escorregadias",
      home: "a varanda de casa, com um bilhete de agradecimento",
    },
  },
} satisfies Record<string, Theme>;

export type ThemeId = keyof typeof THEMES;
export const THEME_IDS = Object.keys(THEMES) as [ThemeId, ...ThemeId[]];
export const themeOf = (id: string): Theme => THEMES[id as ThemeId] ?? THEMES.dinossauros;
