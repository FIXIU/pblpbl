# Sztuczny Dach (Artificial Roof Testbed)
### Stacja Badawcza Właściwości Refleksyjnych i Termoizolacyjnych Powłok Dachowych
**Platforma docelowa:** Raspberry Pi 5 (Linux / Raspberry Pi OS 64-bit)

---

## 1. Opis Projektu
Stanowisko badawcze służy do precyzyjnego pomiaru właściwości chłodzących i odbijających promieniowanie podczerwone (Cool Roof coatings, nanometale, TiO2) próbek blach o wymiarach **10×15 cm**.

### Kluczowe komponenty sprzętowe:
1. **Lampa grzewcza (promiennik kwarcowy/halogenowy)** sterowana przez przekaźnik półprzewodnikowy **SSR-40DA** (slow time-proportional PWM).
2. **Kamera termowizyjna MLX90640 (110° FOV)** – rejestracja dwuwymiarowego rozkładu temperatur na powierzchni próbki (siatka 32×24 punktów, 4 Hz).
3. **Termopara typu K z przetwornikiem MAX6675** – pomiar temperatury spodu płyty testowej (Hardware SPI0).
4. **Mobilny Panel Next.js + shadcn/ui** – pełny podgląd telemetryczny w czasie rzeczywistym (WebSocket 4 Hz), interaktywna mapa termowizyjna z regulowanym obszarem ROI 10×15 cm, krzywe stygnięcia i rejestrator sesji do plików `.csv`.

---

## 2. Schemat Połączeń GPIO dla Raspberry Pi 5

> [!IMPORTANT]
> **Ostrzeżenie Raspberry Pi 5:** W architekturze RPi 5 układ RP1 zastąpił tradycyjne rejestry Broadcom GPIO. Biblioteka `RPi.GPIO` **nie działa**. System korzysta wyłącznie z nowoczesnej biblioteki `gpiozero` z fabryką pinów `lgpio` (`GPIOZERO_PIN_FACTORY=lgpio`).

| Urządzenie | Funkcja / Pin Urządzenia | Pin Fizyczny RPi 5 | Nazwa GPIO (BCM) | Interfejs |
| :--- | :--- | :--- | :--- | :--- |
| **SSR-40DA** | Wejście Sterujące (+) DC | Pin 12 | **GPIO 18** | PWM czasowo-proporcjonalny (2.0s) |
| **SSR-40DA** | Wejście Sterujące (-) DC | Pin 14 | **GND** | Masa układu sterowania |
| **MAX6675** | VCC | Pin 17 | **3.3V** | Zasilanie cyfrowe |
| **MAX6675** | GND | Pin 25 | **GND** | Masa SPI |
| **MAX6675** | SO (MISO) | Pin 21 | **GPIO 9 (MISO)** | Hardware SPI0 |
| **MAX6675** | SCK (SCLK) | Pin 23 | **GPIO 11 (SCLK)** | Hardware SPI0 (Max 4 MHz) |
| **MAX6675** | CS (Chip Select) | Pin 24 | **GPIO 8 (CE0)** | Hardware SPI0 Chip Select |
| **MLX90640** | VIN | Pin 1 | **3.3V** | Zasilanie sensora IR |
| **MLX90640** | GND | Pin 9 | **GND** | Masa I2C |
| **MLX90640** | SDA | Pin 3 | **GPIO 2 (SDA)** | Hardware I2C1 |
| **MLX90640** | SCL | Pin 5 | **GPIO 3 (SCL)** | Hardware I2C1 (Baudrate 400 kHz) |

---

## 3. Konfiguracja Raspberry Pi 5 (Przed Uruchomieniem)

### 3.1. Aktywacja I2C (400 kHz) i SPI w `/boot/firmware/config.txt`
Kamera MLX90640 wymaga szybkiej magistrali I2C (400 kHz lub 1 MHz), aby odczytywać 768 wartości przy 4 Hz.

Edytuj plik konfiguracyjny na Raspberry Pi:
```bash
sudo nano /boot/firmware/config.txt
```
Upewnij się, że poniższe linie są aktywne:
```ini
dtparam=i2c_arm=on
dtparam=i2c_arm_baudrate=400000
dtparam=spi=on
```
Zapisz plik i uruchom ponownie Pi:
```bash
sudo reboot
```

### 3.2. Weryfikacja wykrycia urządzeń na magistralach
```bash
# Sprawdź kamerę MLX90640 (powinna zgłosić się pod adresem 0x33)
i2cdetect -y 1

# Sprawdź moduł SPI
ls -l /dev/spidev0.*
```

---

## 4. Uruchomienie Systemu

System wspiera dwa tryby:
- `SIMULATION_MODE=true` (domyślny) – umożliwia testowanie całego oprogramowania na laptopie bez fizycznego sprzętu (generuje realistyczny 2D rozkład Gaussa, bezwładność termiczną płyty i odblaski żarnika).
- `SIMULATION_MODE=false` – aktywuje fizyczne sterowniki GPIO, SPI i I2C na Raspberry Pi 5.

### 4.1. Uruchomienie Backend (FastAPI)
```bash
cd backend
python -m venv venv

# Na Windows/Laptopie:
.\venv\Scripts\activate
pip install -r requirements.txt

# Na Raspberry Pi 5:
source venv/bin/activate
pip install -r requirements-pi.txt

# Uruchomienie serwera API i pętli 4 Hz:
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### 4.2. Uruchomienie Frontend (Next.js Dashboard)
```bash
cd frontend
pnpm install
pnpm dev
```
Otwórz w przeglądarce telefonu lub laptopa:
`http://<IP_RASPBERRY_PI>:3000`

---

## 5. Funkcje Specjalistyczne

### 5.1. Tryb "Pomiar bez Odbić IR" (Anti-Glare Snapshot)
Żarniki lamp halogenowych/promienników emitują intensywne pasmo IR, które odbija się od badanej powłoki prosto w obiektyw kamery MLX90640, zniekształcając pomiar emisyjności.
- Po włączeniu trybu, stacja automatycznie (np. co 30 sekund) odcina zasilanie SSR do 0%.
- Czeka 1.5 sekundy na wygaszenie poświaty żarnika.
- Wykonuje czysty pomiar temperatury, zapisuje go do pliku CSV z flagą `is_clean_snapshot=True` oraz zrzuca pełną matrycę 32×24 do pliku `.json`.
- Natychmiast przywraca zadaną moc lampy.

### 5.2. Safety Watchdog (Ochrona Przed Przegrzaniem)
- W przypadku przekroczenia $110^\circ\text{C}$ na termoparze spodu lub $120^\circ\text{C}$ na powierzchni, przekaźnik SSR zostaje natychmiast wyłączony sprzętowo (GPIO LOW).
- W przypadku utraty łączności z sensorami na dłużej niż 1.5s następuje natychmiastowy stop.
- Ponowne odblokowanie stacji wymaga potwierdzenia przez operatora w panelu webowym po ostygnięciu próbki poniżej $60^\circ\text{C}$.

### 5.3. Rejestracja Danych do CSV
Pliki logów sesji zapisywane są w katalogu `backend/data/sessions/` z nagłówkami:
`timestamp,elapsed_sec,session_name,coating_name,mode,ssr_power_pct,max6675_temp_c,roi_avg_temp_c,roi_max_temp_c,roi_min_temp_c,delta_t_insulation,is_clean_snapshot`

---

## 6. Autostart jako Usługa Systemowa (systemd na RPi 5)

W katalogu `systemd/` znajdują się pliki serwisowe:
1. Skopiuj pliki do systemd:
   ```bash
   sudo cp systemd/sztuczny-dach-backend.service /etc/systemd/system/
   sudo cp systemd/sztuczny-dach-frontend.service /etc/systemd/system/
   ```
2. Przeładuj demona i włącz autostart:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now sztuczny-dach-backend.service
   sudo systemctl enable --now sztuczny-dach-frontend.service
   ```
3. Sprawdź status:
   ```bash
   sudo systemctl status sztuczny-dach-backend.service
   ```
