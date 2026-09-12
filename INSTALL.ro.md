# Instalare pe Ubuntu

Aplicația și fișierele Docker sunt pregătite. Tu alegi momentul instalării și introduci credențialele platformelor. Scripturile de mai jos nu instalează pachete, nu pornesc automat transmisiuni și nu execută operații pe RAID.

## 1. Pregătire

Pe server ai nevoie de Docker Engine, Docker Compose v2, Bash, OpenSSL și Python 3. Directorul `/data` trebuie să fie deja montat. Copiază proiectul pe server, fără directoarele `.cache`, `node_modules` și `target` de pe calculatorul de dezvoltare.

Intră în directorul proiectului și alege una dintre variante:

**Cu domeniu și HTTPS:**

```sh
bash infrastructure/setup.sh --origin https://stream.domeniul-tau.ro
```

Înlocuiește adresa cu domeniul tău real. Configurează proxy-ul HTTPS către `127.0.0.1:8088`; există un exemplu pentru Caddy în `infrastructure/Caddyfile.example`.

**Pentru evaluare locală prin tunel SSH:**

```sh
bash infrastructure/setup.sh --local
```

Scriptul creează `.env` cu parole aleatoare distincte și cheia de criptare. Nu afișează parolele și refuză să suprascrie un fișier existent. Dacă ai deja `.env`, păstrează-l și verifică valorile folosind `.env.example` ca referință. Nu regenera `ENCRYPTION_KEY` peste o bază de date existentă.

## 2. Verificare și pornire

```sh
python3 infrastructure/preflight.py
docker compose up -d --build
docker compose ps
```

Verificarea citește configurația, permisiunile fișierului, disponibilitatea Docker, montarea directorului de date și starea disponibilă a RAID-ului. Nu schimbă discuri, servicii sau reguli de rețea. Prima compilare poate dura; cele 8 GB de RAM trebuie să fie disponibile și pentru sistemul de operare.

Pentru varianta locală, deschide de pe calculatorul tău un tunel către server:

```sh
ssh -L 8088:127.0.0.1:8088 utilizator@ADRESA_SERVERULUI
```

Apoi deschide `http://localhost:8088`. Pentru varianta HTTPS, deschide domeniul configurat. Utilizatorul inițial este `admin`; citește parola din `ADMIN_PASSWORD` în fișierul `.env`, într-un editor privat. Poți schimba parola din Settings după autentificare.

## 3. OBS și destinații

În OBS → Settings → Stream → Custom:

- **Server:** `rtmp://ADRESA_SERVERULUI:1935`
- **Stream key:** `live?user=obs&pass=VALOAREA_OBS_PASSWORD`

Folosește valoarea `OBS_PASSWORD` din `.env`. Configurează H.264 pentru video și AAC pentru audio. Permite accesul la portul 1935 doar din rețeaua de încredere sau prin VPN.

În Destinations, introdu separat URL-ul și cheia pentru YouTube/Facebook, apoi activează destinațiile. Pornește OBS și apasă Start relay în Live. Confirmă publicarea și în YouTube Studio/Facebook Live Producer; starea `forwarding` confirmă transportul media, nu vizibilitatea publică a evenimentului.

## Date persistente și oprire

```sh
docker compose stop
docker compose start
```

Datele aplicației sunt în volumul PostgreSQL. Păstrează un backup al bazei de date și al `ENCRYPTION_KEY`. Nu folosi `docker compose down -v` dacă vrei să păstrezi datele. La repornirea backendului, retransmisia este oprită intenționat și trebuie pornită din nou din Live.

Pentru detalii: [README](README.md), [API](docs/API.md) și [verificările efectuate](docs/VERIFICATION.md). Testele locale cu PostgreSQL și retransmisie MediaMTX au trecut. Build-ul imaginilor Docker și verificările hardware pe Ubuntu rămân de efectuat pe serverul tău.
