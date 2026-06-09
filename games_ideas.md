# 🚀 Idées de Jeux & Trends Sociaux (YouTube UK/US & TikTok) — BLOOP

Ce document rassemble les concepts de jeux inspirés des plus gros créateurs de contenu anglophones (*Sidemen, Beta Squad, Jubilee, Cut, MrBeast*) et des dernières tendances virales mobiles. 

Grâce à l'architecture de **BLOOP**, 95% de ces concepts s'intègrent directement dans nos 5 templates existants via de simples configurations JSON et des content packs sur R2, **sans aucun développement de code supplémentaire**.

---

## 1. Catégorie : ".io / Vitesse / Chaos Blitz"
*Mots-clés : .io, multiplayer, simple, easy, fast, laugh, short*

### ⚡ Name 3 in 5s (Inspiré des Shorts viraux US)
* **Template BLOOP :** `INPUT_GUESS` (Variante Blitz)
* **Couleur Dominante :** `#45D0E8` Cyan (Vitesse, challenge)
* **Dynamic Social :** L'application désigne un joueur au hasard à l'écran et lui lâche un prompt ultra-simple mais stressant (ex: *"Name 3 ex-girlfriends of your friends"* ou *"Name 3 reasons to get cancelled"*).
* **Gameplay :** Le joueur doit les crier à l'oral en moins de 5 secondes. Les autres joueurs cliquent instantanément sur un bouton Vert (Validé) ou Rouge (Raté/Trop lent) sur leur écran.
* **Focus DA & Animations :** Un énorme timer rond qui tremble, grossit et devient rouge vif dès qu'il passe sous les 2 secondes.

---

## 2. Catégorie : "Pass the Phone / Cyber-Banter"
*Mots-clés : trend, short, viral, party, social, team, laugh, multiplayer*

### 📱 Pass the Bloop (Inspiré de la méga-trend TikTok "Passing the Phone")
* **Template BLOOP :** `VOTE`
* **Couleur Dominante :** `#FF6B8A` Rose bonbon (Social, piquant)
* **Dynamic Social :** L'app affiche une phrase assassine mais drôle : *"I'm passing the phone to someone who still sleeps with a night light"* ou *"I'm passing the phone to the person with the most questionable rizz"*.
* **Gameplay :** Au lieu de faire passer physiquement un seul téléphone, tout le monde vote secrètement sur son propre écran pour désigner la cible dans la pièce. Les votes sont révélés un par un (*flip card*) pour maximiser la tension.
* **Focus DA & Animations :** Quand le résultat tombe, le petit personnage **Bloop** du joueur le plus voté reçoit l'item en question sur sa tête (ex: une petite veilleuse ou une couronne de "Cringe") via une animation *spring*.

---

## 3. Catégorie : "Roleplay Simplifié / Infiltration"
*Mots-clés : role play, interactive, cartoonesque, team, secret role, among us*

### 🕵️‍♂️ The NPC Infiltrator (Inspiré des formats "Guess the Real Pro" de Beta Squad)
* **Template BLOOP :** `SECRET_ROLE`
* **Couleur Dominante :** `#FF6B6B` Rouge corail (Tension, suspense)
* **Dynamic Social :** 4 joueurs reçoivent une "Identité" de groupe avec des directives de comportement très simples (ex: *"Vous êtes des influenceurs fitness toxiques"*). 1 joueur reçoit le rôle d'**Infiltré (Le NPC)** : il ne sait pas quel est le thème du groupe, il doit juste mimer et s'adapter aux répliques des autres pour se fondre dans la masse.
* **Gameplay :** À tour de rôle, chaque joueur doit sortir une punchline ou une affirmation à l'oral en restant dans son personnage. À la fin du temps de discussion, tout le monde vote pour éliminer le "NPC".
* **Focus DA & Animations :** Quand le NPC est démasqué, son Bloop se transforme (yeux rouges) et l'écran tremble, ou il éclate comme une bulle de savon avec un son *"Pop!"* si le groupe a vu juste.

---

## 4. Catégorie : "L'alignement psychologique (Jubilee / Cut)"
*Mots-clés : interactive, party, social, ranking, team*

### 🟢 Guess My Rank (Inspiré des concepts "Spectrum / Lineup" de Cut)
* **Template BLOOP :** `RANKING`
* **Couleur Dominante :** `#FF9F43` Orange pêche (Compétition, classement)
* **Dynamic Social :** Un critère très axé sur l'ego ou la psychologie du groupe apparaît (ex: *"Rank your friends from the most 'Main Character' to the most 'NPC'"* ou *"Who handles money the worst?"*).
* **Gameplay :** Chaque joueur doit se classer *lui-même* secrètement par drag & drop, puis classer le reste du groupe. Le moteur calcule le consensus moyen. Le jeu attribue les points selon le décalage entre ta propre perception et celle que le groupe a de toi.

---

## 5. Catégorie : "L'esprit Jackbox / Collaboratif"
*Mots-clés : collaborative, team, interactive, simple, easy*

### 🧩 Just One Word (Inspiré du format de jeu de société viral sur le YT US)
* **Template BLOOP :** `INPUT_GUESS`
* **Couleur Dominante :** `#5DDEB4` Vert menthe (Vérité, confiance)
* **Dynamic Social :** Un jeu **100% collaboratif**. Un joueur est désigné "Devineur". L'application montre un mot secret aux *autres* joueurs (ex: *Chocolat*).
* **Gameplay :** Chaque joueur tape secrètement **un seul mot** d'indice sur son téléphone (ex: *Tablette*, *Noir*). 
* **Le piège algorithmique :** Si deux joueurs écrivent exactement le même mot d'indice, le filtre de l'application élimine automatiquement ces doublons avant que le devineur ne voie les indices. Il faut être original sans être trop complexe.

---

## 🛠️ Exemple de Configuration JSON pour la pipeline IA (`game_config`)

Voici comment notre pipeline IA (Claude API) peut packager automatiquement le jeu **Pass the Bloop** pour l'injecter dans la Home sans recompiler l'application :

```json
{
  "id": "pass-the-bloop-2026",
  "name": "PASS THE BLOOP",
  "description": "The viral 'Passing the phone' TikTok trend, customized for your friend group",
  "template": "VOTE",
  "color": "#FF6B8A",
  "icon": "phone",
  "badge": "TRENDING",