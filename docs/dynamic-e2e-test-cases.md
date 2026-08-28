# Sentrovia Dynamic E2E Test Cases

Bu dosya, Sentrovia'nın tarayıcı üzerinden dinamik olarak test edilmesi için hazırlanmış senaryo kataloğudur. Testler sabit ID, sabit sıra veya önceden eklenmiş demo verisine güvenmemelidir.

## Uygulama kuralları

- Her çalıştırmada benzersiz bir `runId` üret: `e2e-${timestamp}-${random}`.
- Kullanıcı, şirket, monitor, rapor ve status page adlarında bu `runId` kullanılsın.
- Testler API yanıtından dönen gerçek ID/slug değerlerini sonraki adımlara aktarsın.
- Test sonunda oluşturulan veriler silinsin; başarısız testte cleanup `finally` aşamasında yeniden denensin.
- Her mutation isteğinde aynı-origin header, geçerli CSRF davranışı ve yetki kontrolü doğrulansın.
- Beklemeler sabit `sleep` yerine görünür UI durumu, network yanıtı veya ilgili kayıt üzerinden yapılmalı.
- Aşağıdaki adımlar Playwright benzeri bir araçla, gerçek tarayıcı oturumu ve gerçek uygulama API'si kullanılarak uygulanmalıdır.

## Test formatı

Her testte `Ön koşul`, `Adımlar` ve `Beklenen` alanları bulunur. `Txxx` değeri test kimliğidir; test adı raporlama sisteminde aynen kullanılmalıdır.

## Kimlik doğrulama ve onboarding

| ID | Test adı | Ön koşul / adımlar | Beklenen |
|---|---|---|---|
| T001 | İlk kurulum onboarding'i gösterir | Temiz veritabanında `/` aç | Onboarding görünür, login görünmez |
| T002 | İlk admin hesabı oluşturma | Onboarding formunu geçerli dinamik bilgilerle gönder | Hesap admin rolüyle oluşturulur |
| T003 | Onboarding zorunlu alan doğrulaması | Kullanıcı adı, e-posta veya şifreyi boş bırakıp gönder | Alan bazlı hata görünür, kayıt oluşmaz |
| T004 | Onboarding zayıf şifreyi reddeder | Minimum kurala uymayan şifre gönder | Şifre hatası görünür |
| T005 | Onboarding tekrarını engeller | Admin oluşturulduktan sonra onboarding endpoint/formunu tekrar aç | Yeni ilk-admin kaydı açılamaz |
| T006 | Geçerli login | Oluşturulan admin ile login ol | Dashboard'a yönlenir, session cookie oluşur |
| T007 | Hatalı parola login'i | Doğru kullanıcı, yanlış parola gönder | Genel kimlik doğrulama hatası görünür |
| T008 | Hatalı kullanıcı login'i | Var olmayan kullanıcıyla gönder | Hesap varlığını ifşa etmeyen hata görünür |
| T009 | Login alanlarının klavye akışı | E-posta → parola → submit için Tab kullan | Odak sırası mantıklıdır, form gönderilir |
| T010 | Logout session temizliği | Giriş yap, logout seç | `/login` açılır ve korumalı API 401 döner |
| T011 | Süresi geçersiz session | Session cookie'yi geçersizleştirip korumalı route aç | Login'e yönlendirilir |
| T012 | Yetkisiz onboarding API | Mevcut session ile onboarding mutation çağır | 403/uygun hata döner, hesap değişmez |

## Ana navigasyon ve ortak kabuk

| ID | Test adı | Ön koşul / adımlar | Beklenen |
|---|---|---|---|
| T013 | Ana menü route geçişleri | Sidebar'daki tüm bağlantıları sırayla aç | Her bağlantı doğru sayfayı 200 ile gösterir |
| T014 | Alt navigasyon mobil geçişi | 390px viewport'ta bottom nav bağlantılarını aç | Route değişir, içerik viewport dışına taşmaz |
| T015 | Aktif menü göstergesi | Her route'ta sidebar'ı incele | Sadece mevcut route aktif görünür |
| T016 | Tarayıcı geri/ileri davranışı | Dashboard → Monitoring → geri → ileri | Sayfa ve filtre durumu tutarlı kalır |
| T017 | Yenileme sonrası route korunur | Korumalı bir route'ta browser reload yap | Aynı route açılır, session korunur |
| T018 | Global hata sınırı | Kontrollü render/API hatası üret | Kullanıcıya okunabilir hata ve yeniden dene aksiyonu görünür |
| T019 | Loading state | Yavaş network ile sayfa aç | Skeleton/loading görünür, layout zıplamaz |
| T020 | 404 sayfası | Var olmayan route aç | Uygulama kabuğuna uygun 404 görünür |

## Dashboard ve kişiselleştirme

| ID | Test adı | Ön koşul / adımlar | Beklenen |
|---|---|---|---|
| T021 | Dashboard özet metrikleri | En az iki monitor oluştur, dashboard aç | Total/online/offline metrikleri veritabanıyla eşleşir |
| T022 | Dashboard canlı yenileme | Monitor durumunu API üzerinden değiştir, stream/poll bekle | İlgili kart güncellenir |
| T023 | System health görüntüsü | Worker çalışırken dashboard aç | Worker, internet ve kuyruk durumu doğru görünür |
| T024 | Worker durdurma | Admin olarak Stop Worker seç | Durum stopped olur ve UI aksiyonu değişir |
| T025 | Worker başlatma | Worker stopped iken Start Worker seç | Durum running olur |
| T026 | Dashboard customize açma | Customize düğmesine tıkla | Panel açılır, mevcut tercihler yüklenir |
| T027 | Widget gizleme | Bir widget'ı kapatıp kaydet | Widget dashboard'dan kalkar |
| T028 | Widget yeniden gösterme | Gizli widget'ı tekrar seçip kaydet | Widget geri gelir |
| T029 | Widget sıralama | İki widget'ı yukarı/aşağı taşı, kaydet, reload yap | Sıra kalıcı ve doğru olur |
| T030 | Dashboard tercihi izolasyonu | Admin A tercihini değiştir, kullanıcı B ile aç | B'nin tercihi A'dan etkilenmez |
| T031 | Monitor focus favorite | Bir monitorü favorite işaretle | Focus alanında favorite filtrelemesinde görünür |
| T032 | Monitor focus critical | Bir monitorü critical işaretle | Critical focus seçiminde görünür |
| T033 | Focus filtresini kaldırma | Favorite/critical işaretini kaldır | Monitor ilgili focus listesinden çıkar |
| T034 | Boş dashboard durumu | Tüm monitorleri sil veya yeni workspace kullan | Boş durum kısa ve doğru mesaj gösterir |

## Monitoring

| ID | Test adı | Ön koşul / adımlar | Beklenen |
|---|---|---|---|
| T035 | HTTP monitor oluşturma | Geçerli public URL ve 5 dakika interval gönder | Monitor oluşur ve pending görünür |
| T036 | Monitor form zorunlu alanları | URL/name boş gönder | Form kayıt yapmaz, alan hatası gösterir |
| T037 | Monitor URL doğrulaması | Geçersiz scheme veya private hedef gönder | Güvenli doğrulama hatası görünür |
| T038 | Monitor düzenleme | Oluşturulan monitorün intervalini değiştir | Değer kaydedilir, next check yeniden planlanır |
| T039 | Monitor duraklatma | Active monitor için pause seç | `isActive=false`, next check temizlenir |
| T040 | Monitor yeniden aktifleştirme | Paused monitor için resume seç | `isActive=true`, hemen/uygun zamanda kontrol planlanır |
| T041 | Monitor silme | Monitorü sil ve onayla | Kayıt soft-delete olur, listeden çıkar |
| T042 | Monitor geri alma | Silinen monitorü undo/restore et | Kayıt geri gelir ve önceki aktifliği korunur |
| T043 | Monitor arama | Dinamik isimle arama yap | Yalnız eşleşen satırlar görünür |
| T044 | Monitor durum filtresi | Online, offline, paused filtrelerini sırayla seç | Sonuçlar status alanıyla eşleşir |
| T045 | Monitor sıralama | Name, status ve latency sütunlarını sırala | Artan/azalan sıra deterministik olur |
| T046 | Monitor pagination | Sayfa boyutunu değiştir ve sonraki sayfaya geç | Tekrarlı/kayıp satır olmaz |
| T047 | Monitor toplu pause | İki monitor seçip bulk pause yap | Seçilenler güncellenir, diğerleri değişmez |
| T048 | Monitor toplu silme | İki monitor seçip bulk delete yap | Yalnız seçilenler silinir |
| T049 | Monitor import preview | Geçerli dinamik YAML/JSON yükle | Preview kayıtları ve uyarılar doğru görünür |
| T050 | Monitor import limit | Limit üstü dosya yükle | Dosya reddedilir, kısmi kayıt oluşmaz |
| T051 | Monitor export secret redaction | Secret içeren monitorü export et | Token/parola dışa aktarımda maskelenir |
| T052 | Heartbeat token kabulü | Heartbeat monitor oluştur, token gönder | Token hashlenir, plaintext response'a dönmez |
| T053 | Heartbeat geçerli sinyal | Heartbeat endpoint'ine doğru token gönder | Sinyal kabul edilir, son alınma zamanı güncellenir |
| T054 | Heartbeat yanlış token | Yanlış token gönder | 404/uygun hata döner, monitor değişmez |
| T055 | Port monitor doğrulaması | Geçerli host/port ile oluştur | Form ve worker sonucu doğru kaydedilir |
| T056 | Ping monitor doğrulaması | Geçerli host ile ping monitor oluştur | Monitor listede görünür |
| T057 | PostgreSQL monitor bağlantısı | Test veritabanı bilgileriyle oluştur | Başarılı veya açıklanabilir bağlantı sonucu görünür |
| T058 | Keyword assertion | Yanıt içeren URL ve keyword tanımla | Keyword bulunduğunda up, bulunmadığında failure kaydedilir |
| T059 | JSON assertion | JSON path ve beklenen değeri tanımla | Eşleşme sonucu doğru status üretir |
| T060 | Retry ve verification akışı | Kontrollü başarısız URL ile monitor çalıştır | İlk hata pending, eşik sonrası down olur |
| T061 | Recovery akışı | Down monitor hedefini düzelt, sonraki kontrolü bekle | Recovery event ve bildirim tekilleştirilir |
| T062 | Slow response eşiği | Yanıtı eşik üstü test endpoint'i kullan | Up kalır, slow-response event oluşur |
| T063 | Hard timeout | Yanıtı timeout üstü endpoint kullan | Check timeout ile sonlanır, latency gerçek süreyi yansıtır |
| T064 | Private target güvenliği | Yetkisiz kullanıcıyla loopback/private URL gönder | İstek engellenir |
| T065 | Monitor detay geçmişi | Monitor satırından detail/history aç | Yalnız ilgili monitor eventleri görünür |
| T066 | Monitor notification template preview | Monitor ayarında custom email/Telegram template aç | Önizleme tokenları gerçek monitorle çözülür |
| T067 | Monitor ayarlarında varsayılan mirası | Template alanlarını boş bırak, workspace default değiştir | Monitor yeni workspace defaultunu kullanır |
| T068 | Monitor flag kalıcılığı | Favorite ve critical flag'lerini değiştir, reload yap | Flag'ler kaybolmaz |

## Companies ve company scope

| ID | Test adı | Ön koşul / adımlar | Beklenen |
|---|---|---|---|
| T069 | Company oluşturma | Dinamik ad ve notification recipient bilgileri gönder | Company oluşur |
| T070 | Company zorunlu alan doğrulaması | Company adını boş gönder | Kayıt reddedilir |
| T071 | Company düzenleme | Adı ve recipient e-postasını değiştir | Değişiklikler kaydedilir |
| T072 | Company duplicate engeli | Aynı scope'ta aynı adı ikinci kez oluştur | Unique hata görünür, ikinci kayıt oluşmaz |
| T073 | Company silme ve restore | Company sil, sonra restore et | İlişkili monitor davranışı ve aktiflik korunur |
| T074 | Company monitor listesi | Company detayını aç | Yalnız o company'ye bağlı monitorler görünür |
| T075 | Monitor company atama | Monitorü company A'dan B'ye taşı | Her iki listede doğru güncellenir |
| T076 | Company recipients email | Company'ye iki e-posta ekle | Normalizasyon ve tekrarlar doğru işlenir |
| T077 | Company Telegram recipient | Bot token ve chat ID kaydet | Secret maskelenir, company'ye özel fallback çalışır |
| T078 | Company notification fallback | Monitor recipient boş, company recipient dolu olsun | Bildirim company kanalına gider |
| T079 | Company scope izolasyonu | Company A seçiliyken B monitorü API ile isteme | Kayıt sızmaz; 404/boş sonuç döner |
| T080 | Dashboard company scope seçimi | Customize içinde gerçek company seç | Invalid UUID oluşmaz, tercih kaydedilir |

## Delivery ve bildirimler

| ID | Test adı | Ön koşul / adımlar | Beklenen |
|---|---|---|---|
| T081 | Delivery geçmişi yükleme | Başarılı/başarısız delivery üret, Delivery aç | Satırlar doğru event ve channel bilgisiyle görünür |
| T082 | Delivery filtreleme | Channel, status ve tarih filtresi uygula | Sonuçlar filtrelerle eşleşir |
| T083 | Delivery satır detayları | Bir delivery satırını aç | Payload ve hata ayrıntısı gösterilir |
| T084 | Delivery retry | Retry edilebilir başarısız satırda Retry seç | Yeni deneme kaydedilir, duplicate event oluşmaz |
| T085 | Delivery retry yetkisi | Viewer rolüyle retry çağır | 403 döner |
| T086 | SMTP test gönderimi | Geçerli test SMTP ayarlarıyla send test | Başarı veya sağlayıcı hatası açıkça gösterilir |
| T087 | Telegram test gönderimi | Geçerli bot token/chat ID ile test | Mesaj gönderim sonucu kaydedilir |
| T088 | Discord webhook test gönderimi | Geçerli webhook ile test | Kanal sonucu görünür |
| T089 | Generic webhook testi | Dinamik endpoint ile test | Yanıt kodu ve teslim sonucu kaydedilir |
| T090 | Kanal izolasyonu | Email başarısız, Telegram başarılı delivery üret | Telegram sonucu email hatasından etkilenmez |
| T091 | Notification template kaydetme | Workspace email/Telegram template değiştir | Yeni template preview ve gerçek gönderimde kullanılır |
| T092 | Template token çözümleme | Monitor adı, URL, status ve zaman tokenları kullan | Tokenlar kaçışlanmış doğru değerlerle çözülür |
| T093 | Template HTML güvenliği | Template'e script etiketi ekle | Script çalışmaz, HTML güvenli render edilir |
| T094 | Attachment ayarı | Screenshot açıkken kontrollü down üret | Görsel attachment eklenir veya neden atlandığı event'e yazılır |

## Reports

| ID | Test adı | Ön koşul / adımlar | Beklenen |
|---|---|---|---|
| T095 | Report sayfası yükleme | En az bir company ve monitor ile Reports aç | Liste ve sekmeler yüklenir |
| T096 | Report schedule oluşturma | Company, weekly cadence ve recipients seç | Schedule oluşur |
| T097 | Report schedule düzenleme | Subject/brand/window değiştir | Değişiklik kalıcı olur |
| T098 | Report schedule duplicate | Bir schedule duplicate et | Yeni ID ile tek kopya oluşur |
| T099 | Report schedule silme | Schedule sil ve listeyi yenile | Yalnız hedef silinir |
| T100 | Report preview | Son 7 gün seçip preview aç | Preview 200 döner ve doğru tarih penceresi görünür |
| T101 | Report last-seven-days doğruluğu | Sabit olmayan geçmiş check kayıtları oluştur | Başlangıç ve bitiş tam son 7 günlük pencereye uyar |
| T102 | Top failing monitors doğruluğu | Farklı failure sayıları oluştur | Sıralama yalnız seçilen rapor penceresine göre yapılır |
| T103 | Report metrics doğruluğu | Up/down/latency kayıtları üret | Health, uptime, P95, failures, impacted ve failure rate tutarlı hesaplanır |
| T104 | Report brand düzenleme | Reports customization'da brand değiştir | E-posta header ve HTML raporda yeni brand görünür |
| T105 | Report subject düzenleme | Subject template değiştirip preview yap | Konu yeni template ve tokenlarla çözülür |
| T106 | Report email gönderimi | SMTP ayarlı schedule için Send now seç | Tek rapor gönderilir, delivery kaydı oluşur |
| T107 | Report Telegram gönderimi | Telegram recipient ayarlı schedule için gönder | Telegram sonucu kaydedilir |
| T108 | Report cross-origin koruması | Farklı origin'den POST `/api/reports` gönder | İstek 403 ile reddedilir |

## Settings, members ve profile

| ID | Test adı | Ön koşul / adımlar | Beklenen |
|---|---|---|---|
| T109 | Settings sekmeleri | Settings içindeki tüm sekmeleri aç | Her sekme doğru içerik ve ikonla yüklenir |
| T110 | Monitor defaults kaydetme | Interval, timeout, retry değiştir | Yeni monitor varsayılanları kullanır |
| T111 | Alert conditions kaydetme | Slow response ve SSL ayarlarını değiştir | Ayarlar persist edilir |
| T112 | Additional channels kaydetme | Discord/webhook kanalı ekle ve sil | Liste doğru güncellenir |
| T113 | Settings secret maskesi | SMTP/token alanlarını aç ve reload yap | Secret değerleri plaintext ifşa olmaz |
| T114 | Backup export | Admin olarak backup export başlat | Dosya iner, secret redaction uygulanır |
| T115 | Backup import preview | Geçerli backup yükle | Eklenecek/silinecek kayıt özeti görünür |
| T116 | Backup import doğrulaması | Bozuk veya limit üstü backup yükle | Import atomik olarak reddedilir |
| T117 | Member oluşturma | Admin yeni operator/viewer üye ekler | Üye listede doğru rolle görünür |
| T118 | Member rol güncelleme | Operator rolünü viewer yap | Yetkiler sonraki istekte uygulanır |
| T119 | Member silme | Test üyesini sil ve listeyi yenile | Üye erişimi kapanır |
| T120 | Viewer mutation izolasyonu | Viewer company/monitor mutation dener | 403 döner, veri değişmez |
| T121 | Profile bilgisi güncelleme | Ad ve saat dilimini değiştir | Profil ve tarih gösterimleri güncellenir |
| T122 | Şifre değiştirme | Eski/yeni parola ile form gönder | Yeni parola ile login olur, eski parola olmaz |
| T123 | Şifre yanlış eski değer | Yanlış mevcut parola gönder | Değişiklik yapılmaz |

## Help, About ve public status

| ID | Test adı | Ön koşul / adımlar | Beklenen |
|---|---|---|---|
| T124 | Help araması | Help'te benzersiz bir terim ara | İlgili sonuçlar filtrelenir |
| T125 | Help kategori açma | Her kategoriyi aç/kapat | Yalnız seçilen içerik genişler |
| T126 | About bağlantıları | About içindeki Help/Settings/GitHub bağlantılarını aç | Hedefler doğru ve güvenli açılır |
| T127 | Public status page oluşturma | Company A için status page oluştur | Benzersiz slug oluşur |
| T128 | Company başına status page | Company B için ikinci status page oluştur | A ve B birbirinden bağımsız görünür |
| T129 | Status page monitor seçimi | İki monitorü yayınla, birini kaldır | Public sayfada yalnız seçilenler görünür |
| T130 | Public status erişimi | Çıkış yapıp `/status/{slug}` aç | Sayfa auth istemeden yüklenir |
| T131 | Public status slug güvenliği | Geçersiz/olmayan slug aç | 404 görünür, başka company verisi sızmaz |
| T132 | Public status yenileme | Status değiştirip public sayfayı refresh et | Güncel durum gösterilir |
| T133 | Public status tema okunabilirliği | Dark ve light sistem temasıyla aç | Metin, status renkleri ve kontrast okunabilir |

## Güvenlik, sınır durumları ve responsive davranış

| ID | Test adı | Ön koşul / adımlar | Beklenen |
|---|---|---|---|
| T134 | Cross-origin mutation geneli | Şirket, monitor, report ve settings POST/PATCH isteklerini farklı origin'den dene | Her biri 403/uygun CSRF hatası döner |
| T135 | Oversized body | Limit üstü JSON body gönder | 413 döner, kayıt oluşmaz |
| T136 | Malformed JSON | Geçersiz JSON body gönder | 400 döner |
| T137 | IDOR monitor kontrolü | Kullanıcı A, kullanıcı B monitor ID'sini çağırır | 404/403 döner |
| T138 | IDOR company kontrolü | Kullanıcı A, B company detayını çağırır | Veri dönmez |
| T139 | HTML injection log alanı | Monitor name ve event mesajına HTML ekle | UI'da metin olarak gösterilir |
| T140 | URL SSRF engeli | Metadata, loopback ve private hedefleri farklı formatlarda dene | Worker isteği engeller |
| T141 | Rate/duplicate submit | Create düğmesine hızlıca birden fazla tıkla | Tek kayıt oluşur veya güvenli idempotency uygulanır |
| T142 | Mobil monitoring tablo etkileşimi | 390px viewport'ta arama, filtre, satır menüsü ve dialog kullan | Kontroller tıklanabilir, yatay sayfa taşması yok |
| T143 | Mobil dashboard | 390px viewport'ta dashboard aç ve widget değiştir | Kartlar okunur, ana sayfa taşmaz |
| T144 | Tablet layout | 768px viewport'ta tüm ana route'ları gez | Sidebar/content geçişi bozulmaz |
| T145 | Desktop geniş ekran | 1920px viewport'ta dashboard ve monitoring aç | İçerik hizalı, gereksiz aşırı boşluk veya taşma yok |
| T146 | Keyboard-only monitoring | Mouse kullanmadan arama, satır menüsü ve form işlemlerini yap | Tüm işlevlere erişilir |
| T147 | Focus görünürlüğü | Tab ile sayfayı dolaş | Odak göstergesi görünür ve sıra mantıklıdır |
| T148 | Reduced motion | `prefers-reduced-motion` etkin aç | Gereksiz animasyonlar azaltılır, işlev korunur |
| T149 | Locale/timezone raporları | Kullanıcı timezone değiştirip report preview aç | Tarihler seçilen timezone ile tutarlı görünür |
| T150 | Cleanup doğrulaması | Test suite sonunda runId ile arama yap | Test verisi kalmaz, yalnız önceden var olan kayıtlar korunur |

## Önerilen çalıştırma sırası

1. T001–T012 ile workspace ve admin session oluştur.
2. T013–T034 ile ortak kabuk ve dashboard durumunu doğrula.
3. T035–T080 ile monitor/company verilerini üret ve API/UI sonuçlarını karşılaştır.
4. T081–T108 ile delivery ve rapor akışlarını gerçek test sağlayıcıları veya kontrollü local endpoint'lerle çalıştır.
5. T109–T133 ile ayar, kullanıcı ve public yüzleri doğrula.
6. T134–T149'u her kritik mutation ve viewport için tekrarla.
7. T150 cleanup testini her durumda çalıştır.

## Test çıktısı standardı

Her test raporunda test ID'si, runId, viewport, kullanıcı rolü, başlangıç/bitiş zamanı, kullanılan dinamik kayıt ID'leri, network hataları, screenshot/video yolu ve cleanup sonucu bulunmalıdır. Bir test beklenmeyen şekilde atlanırsa `skipped` nedeni açıkça yazılmalı; sessizce başarılı kabul edilmemelidir.
