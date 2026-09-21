// Official store policy of "Наран Америк Бараа" — the single source of truth
// for the legal pages. /terms renders every part; /privacy and /refund-policy
// render their own part + contacts, so the three pages can never contradict
// each other. Server components (no client JS).

export const POLICY_UPDATED = "2026 оны 9 сар";

const PHONE = "7212-3060";
const PHONE_HREF = "tel:72123060";
const EMAIL = "info@naranamerikbaraa.mn";
const ADDRESS =
  "Монгол Улс, Улаанбаатар хот, Хан-Уул дүүрэг, 15-р хороо, Стадион оргил /17011/, Махатма Гандигийн гудамж 135-р байр, 2-р давхар, 226 тоот";

function Part({ id, n, title, children }: { id: string; n: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 pt-2">
      <h2 className="flex items-center gap-2.5 text-[18px] font-bold text-ink pb-3 mb-5 border-b-2 border-ink">
        <span className="text-[12px] font-bold bg-ink text-paper rounded-md px-2 py-0.5">{n}</span>
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink pt-3">
      <span className="inline-block w-1 h-3.5 rounded-sm bg-accent" aria-hidden />
      {children}
    </h3>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 my-2">
      {items.map((it, i) => (
        <li key={i} className="relative pl-5">
          <span className="absolute left-1 top-[0.7em] w-1.5 h-1.5 rounded-full bg-accent" aria-hidden />
          {it}
        </li>
      ))}
    </ul>
  );
}

function Notice({ tone, children }: { tone: "warn" | "info"; children: React.ReactNode }) {
  const cls = tone === "warn"
    ? "bg-amber-50 border-amber-200 text-amber-900"
    : "bg-accent-soft border-accent/30 text-ink";
  return <div className={`rounded-xl border px-4 py-3.5 text-[14px] leading-relaxed ${cls}`}>{children}</div>;
}

const b = (t: string) => <strong className="text-ink font-semibold">{t}</strong>;

// ---------------------------------------------------------------- highlights
export function PolicyHighlights() {
  const items: [string, string][] = [
    ["100% Оригинал", "АНУ-аас албан ёсны эх хувь"],
    ["24–48 цагийн хүргэлт", "Улаанбаатар & Орон нутаг"],
    ["Уян хатан төлбөр", "QPay, карт, хуваан төлөх"],
    ["Нууцлалын баталгаа", "Хуулийн дагуу хамгаалагдсан"],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 not-prose">
      {items.map(([t, d]) => (
        <div key={t} className="rounded-xl border border-line bg-mist px-3.5 py-3">
          <div className="text-[13px] font-bold text-ink leading-snug">{t}</div>
          <div className="text-[12px] text-muted mt-0.5 leading-snug">{d}</div>
        </div>
      ))}
    </div>
  );
}

export function PolicyNav() {
  const links: [string, string][] = [
    ["#sec-terms", "1. Үйлчилгээний нөхцөл"],
    ["#sec-privacy", "2. Нууцлалын бодлого"],
    ["#sec-returns", "3. Буцаах, солих журам"],
    ["#sec-contact", "4. Холбоо барих"],
  ];
  return (
    <nav aria-label="Баримт бичгийн бүлгүүд" className="flex flex-wrap gap-2">
      {links.map(([href, label]) => (
        <a key={href} href={href}
          className="text-[13px] font-medium rounded-pill border border-line bg-paper px-3.5 py-1.5 text-muted hover:text-ink hover:border-ink/30 transition-colors">
          {label}
        </a>
      ))}
    </nav>
  );
}

// ------------------------------------------------------------ I. Terms
export function TermsPart() {
  return (
    <Part id="sec-terms" n="I" title="ҮЙЛЧИЛГЭЭНИЙ НӨХЦӨЛ">
      <Sub>1. Нийтлэг үндэслэл</Sub>
      <p>{b("1.1.")} Энэхүү үйлчилгээний нөхцөл нь нэг талаас цахим худалдан авалт хийж буй хэрэглэгч (цаашид “Хэрэглэгч”, “Та” гэх), нөгөө талаас Монгол Улс, Улаанбаатар хот, Хан-Уул дүүргийн 15-р хороо, Стадион оргил /17011/, Махатма Гандигийн гудамж 135-р байр, 2-р давхар, 226 тоот хаягт байрлах &quot;Наран Америк Бараа&quot; (цаашид “Дэлгүүр”, “Компани” гэх)-ийн албан ёсны цахим худалдааны систем (цаашид “Вэб сайт” гэх)-ийн хооронд үүсэх бараа бүтээгдэхүүн сонгох, захиалах, худалдах, хүргэх, хэрэглэгчийн мэдээллийн аюулгүй байдлыг хангахтай холбоотой харилцааг зохицуулна.</p>
      <p>{b("1.2.")} Хэрэглэгч тус системд бүртгүүлэх, зочин хэрэглэгчээр захиалга үүсгэх, төлбөр төлөх товч дарснаар энэхүү үйлчилгээний нөхцөлийг бүрэн уншиж танилцан хүлээн зөвшөөрсөнд тооцно.</p>
      <p>{b("1.3.")} Вэб сайтын лого, брэнд нэр, дизайн, зураг болон контентыг зөвшөөрөлгүй хуулах, дуурайх, олшруулах, бусад зорилгоор ашиглахыг хориглоно. Зөрчсөн тохиолдолд холбогдох хууль тогтоомжийн дагуу хариуцлага тооцно.</p>

      <Sub>2. Бүтээгдэхүүний чанар ба баталгаа</Sub>
      <p>{b("2.1.")} Манай дэлгүүрт худалдаалагдаж буй үнэртэй ус, гоо сайхны бүх бүтээгдэхүүн нь АНУ болон албан ёсны дистрибьютерүүдээс нийлүүлэгддэг {b("100% оригинал")}, чанарын баталгаатай эх хувь байна.</p>
      <p>{b("2.2.")} Бүтээгдэхүүний тайлбар, үнэрийн нотууд, арьсны төрөл, эзлэхүүн (ml/oz)-ийг үнэн зөв мэдээлэхийг зорьдог. Үйлдвэрлэгчийн зүгээс сав баглаа боодлын дизайн, шинэчлэлтийг хийсэн тохиолдолд бодит савлагаа сайтын зургаас үл ялиг зөрөх боломжтой.</p>
      <p>{b("2.3.")} Хэрэглэгч өөрийн сонирхож буй бүтээгдэхүүний найрлага, үнэрийн онцлог, хэрэглэх заавартай сайтар танилцаж сонголтоо хийх үүрэгтэй.</p>

      <Sub>3. Захиалга баталгаажуулах, төлбөр төлөлт</Sub>
      <p>{b("3.1.")} Вэб сайт нь {b("24 цагийн ажиллагаатай")} бөгөөд захиалгыг хэзээ ч хийж болно.</p>
      <p>{b("3.2.")} Хэрэглэгч сагсалсан барааныхаа төлбөрийг дараах төлбөрийн хэрэгслүүдээр бүрэн төлснөөр захиалга баталгаажна:</p>
      <div className="flex flex-wrap gap-2 my-1">
        {["Банк хоорондын шилжүүлэг болон QPay", "Бүх банкны дотоодын болон олон улсын төлбөрийн карт", "Хуваан төлөх финтек (Pocket, Storepay, Simple гэх мэт)"].map(t => (
          <span key={t} className="rounded-lg border border-line bg-mist px-3 py-2 text-[13px] font-semibold text-ink">{t}</span>
        ))}
      </div>
      <p>{b("3.3.")} Дансаар шилжүүлэхдээ захиалгын дугаарыг гүйлгээний утга дээр зөв, төлбөрийн дүнг зөрүүгүй шилжүүлнэ. Гүйлгээний утга буруу, дутуу оруулсан тохиолдолд төлбөр автоматаар баталгаажихгүй бөгөөд Хэрэглэгчтэй харилцах төв (<a href={PHONE_HREF} className="text-accent font-semibold">{PHONE}</a>)-д хандаж тулгуулах шаардлагатай.</p>
      <Notice tone="warn">
        <strong>Анхааруулга:</strong> <strong>3.4.</strong> Төлбөр нь <strong>24 цагийн дотор</strong> төлөгдөөгүй захиалга автоматаар цуцлагдаж, захиалсан бараа үндсэн үлдэгдэл рүү шилжинэ.
      </Notice>

      <Sub>4. Хүргэлтийн нөхцөл</Sub>
      <p>{b("4.1. Улаанбаатар хот доторх энгийн хүргэлт:")} Захиалга баталгаажсанаас хойш {b("24–48 цагийн дотор")} хүргэгдэнэ. Тогтоосон босго үнээс дээш худалдан авалтын хүргэлт үнэгүй байх бөгөөд босго дүнгээс доош худалдан авалтад хүргэлтийн хураамж тооцогдоно.</p>
      <p>{b("4.2. Хот доторх хязгаар:")}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {([["Баруун тийш", "22-ын товчоо, Орбитын эцэс"], ["Зүүн тийш", "Баянзүрхийн товчоо, Улиастайн эцэс"], ["Хойд тийш", "7 буудал, Дамбадаржаа"], ["Урд тийш", "Зайсан, Нисэх, Яармаг"]] as const).map(([dir, loc]) => (
          <div key={dir} className="rounded-xl border border-line bg-mist px-3.5 py-3">
            <div className="text-[11.5px] font-bold uppercase tracking-wide text-accent">{dir}</div>
            <div className="text-[13.5px] font-semibold text-ink">{loc}</div>
          </div>
        ))}
      </div>
      <p>{b("4.3. Орон нутгийн хүргэлт:")} Орон нутгийн унаанд захиалга баталгаажсанаас хойш 24–48 цагийн дотор найдвартай баглаа боодолтойгоор хүлээлгэн өгнө. Унааны хөлсийг хэрэглэгч бараа хүлээн авахдаа хариуцна.</p>
      <p>{b("4.4. Хүлээн авах үеийн шалгалт:")} Хэрэглэгч барааг хүргэлтийн ажилтнаас хүлээн авахдаа савлагааны битүүмжлэл, хайрцагны бүрэн бүтэн байдал, захиалсан бүтээгдэхүүн мөн эсэхийг газар дээр нь шалгаж хүлээн авна.</p>
    </Part>
  );
}

// ------------------------------------------------------------ II. Privacy
export function PrivacyPart() {
  return (
    <Part id="sec-privacy" n="II" title="НУУЦЛАЛЫН БОДЛОГО">
      <p>&quot;Наран Америк Бараа&quot; нь Монгол Улсын <em>&quot;Хүний хувийн мэдээлэл хамгаалах тухай хууль&quot;</em>-ийг чанд мөрдөж, үйлчлүүлэгчийнхээ хувийн мэдээллийн аюулгүй байдлыг дараах нөхцөлөөр хамгаална.</p>

      <Sub>1. Цуглуулах мэдээлэл</Sub>
      <p>Бид үйлчилгээ үзүүлэх явцдаа дараах мэдээллийг хэрэглэгчийн зөвшөөрөлтэйгөөр цуглуулна:</p>
      <Bullets items={[
        "Овог, нэр, холбоо барих утасны дугаар",
        "Цахим шуудан (и-мэйл) хаяг",
        "Бараа хүргүүлэх нарийвчилсан хаяг (дүүрэг, хороо, байр, орцны код гэх мэт)",
        "Худалдан авалт, захиалгын түүхийн мэдээлэл",
      ]} />
      <Notice tone="info">
        <strong>Санамж:</strong> Бид хэрэглэгчийн банкны карт болон дансны нууц дугаарыг хэзээ ч бүртгэж хадгалдаггүй бөгөөд гүйлгээ нь баталгаажсан банк, төлбөрийн гарцын шифрлэгдсэн сувгаар хийгддэг.
      </Notice>

      <Sub>2. Мэдээллийг ашиглах зорилго</Sub>
      <Bullets items={[
        "Захиалгыг баталгаажуулах, савлах, заасан хаягт түргэн шуурхай хүргэх;",
        "Хүргэлтийн цаг тохирох болон хүргэлттэй холбоотой асуудлаар утсаар холбогдох;",
        "Захиалгын төлбөрийн баримт (И-баримт) үүсгэж, илгээх;",
        "Хэрэглэгчийн санал хүсэлт, гомдлыг хүлээн авч шийдвэрлэх;",
        "Хэрэглэгч зөвшөөрсөн тохиолдолд шинэ бараа, хямдрал урамшууллын мэдээлэл хүргэх.",
      ]} />

      <Sub>3. Мэдээллийн аюулгүй байдал</Sub>
      <p>{b("3.1.")} Бид хэрэглэгчийн мэдээллийг гуравдагч этгээдэд худалдахгүй, арилжааны зорилгоор түгээхгүй.</p>
      <p>{b("3.2.")} Захиалгыг хүргэх зорилгоор хүргэлтийн ажилтан эсвэл гэрээт байгууллагад зөвхөн шаардлагатай мэдээллийг (нэр, утас, хаяг) дамжуулна.</p>
      <p>{b("3.3.")} Хууль хяналтын байгууллагын албан ёсны шаардлагаас бусад тохиолдолд мэдээллийг задруулахгүй байх үүргийг Компани хүлээнэ.</p>
    </Part>
  );
}

// ------------------------------------------------------------ III. Returns
export function ReturnsPart() {
  return (
    <Part id="sec-returns" n="III" title="БАРАА БҮТЭЭГДЭХҮҮН БУЦААХ, СОЛИХ ЖУРАМ">
      <p>Үнэртэй ус болон гоо сайхны бүтээгдэхүүн нь хүний эрүүл мэнд, ариун цэвэр, хувийн эмзэг хэрэглээнд шууд хамаардаг бараа тул доорх журмыг хатуу мөрдөнө.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-[14px] font-bold text-emerald-800 mb-3">1. Буцаалт, солилцоо хийх нөхцөл</div>
          <ul className="space-y-2 text-[13px] leading-snug text-emerald-950">
            {[
              <><strong>Үйлдвэрийн битүүмжлэлтэй бараа:</strong> Гаднах гялгар хальс, үйлдвэрийн лац, хамгаалалтын наалт гэмтээгүй, хайрцаг үзэмжээ алдаагүй тохиолдолд хүлээн авснаас хойш <strong>24–48 цагийн дотор</strong> өөр бараагаар солиулах хүсэлт гаргаж болно.</>,
              <><strong>Шүршигч толгой (пульверизатор)</strong> ажиллахгүй байх.</>,
              <><strong>Савлагаа хагарсан</strong>, гоожсон байх.</>,
              <><strong>Буруу бараа:</strong> Захиалсан бараанаас өөр кодтой/нэршилтэй бараа андуурагдаж хүргэгдсэн (хүлээн авснаас хойш <strong>24 цагийн дотор</strong> холбогдон зургаар баталгаажуулна).</>,
            ].map((li, i) => (
              <li key={i} className="relative pl-5"><span className="absolute left-0 font-extrabold text-emerald-600" aria-hidden>✓</span>{li}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="text-[14px] font-bold text-red-800 mb-3">2. Буцаах, солих боломжгүй нөхцөлүүд</div>
          <ul className="space-y-2 text-[13px] leading-snug text-red-950">
            {[
              "Үйлдвэрийн гялгар хальс, лац, лацны наалт задарсан.",
              "Үнэртэй усыг туршиж шүршсэн, хэрэглэсэн.",
              "\"Үнэр нь төсөөлснөөс өөр байна\", \"Үнэр нь таалагдсангүй\", \"Арьсанд тохирохгүй харшил өглөө\" гэсэн шалтгаанаар задлагдсан бүтээгдэхүүн.",
              "Хэрэглэгчийн буруутай үйлдлээс болж хагарсан, гэмтсэн бүтээгдэхүүн.",
            ].map((li, i) => (
              <li key={i} className="relative pl-5"><span className="absolute left-0 font-extrabold text-red-600" aria-hidden>✕</span>{li}</li>
            ))}
          </ul>
        </div>
      </div>

      <Sub>3. Тээврийн зардал ба мөнгө буцаан олгох</Sub>
      <p>{b("3.1.")} Хэрэглэгчийн хүсэлтээр (лац задраагүй барааг солих) гарах хүргэлтийн зардлыг хэрэглэгч бүрэн хариуцна.</p>
      <p>{b("3.2.")} Дэлгүүрийн буруугаас шалтгаалсан буцаалтын хүргэлтийн зардлыг Дэлгүүр хариуцна.</p>
      <p>{b("3.3.")} Буцаалтын төлбөр нь барааг шалгаж хүлээн авснаас хойш {b("ажлын 1–3 хоногт")} хэрэглэгчийн өөрийн нэр дээрх данс руу шилжинэ.</p>
    </Part>
  );
}

// ------------------------------------------------------------ IV. Contact
export function ContactPart({ n = "IV" }: { n?: string }) {
  const cards: [string, React.ReactNode, boolean?][] = [
    ["Байгууллагын нэр", "\"Наран Америк Бараа\""],
    ["Холбогдох утас", <a key="p" href={PHONE_HREF} className="text-accent">{PHONE}</a>],
    ["Цахим шуудан", <a key="e" href={`mailto:${EMAIL}`} className="text-accent break-all">{EMAIL}</a>],
    ["Ажиллах цагийн хуваарь", "24/7 Цахим худалдаа"],
    ["Албан ёсны хаяг байршил", ADDRESS, true],
  ];
  return (
    <Part id="sec-contact" n={n} title="АЛБАН ЁСНЫ МЭДЭЭЛЭЛ, ХОЛБОО БАРИХ">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map(([label, value, full]) => (
          <div key={label} className={`rounded-xl border border-line bg-mist p-4 ${full ? "sm:col-span-2" : ""}`}>
            <div className="text-[11.5px] font-bold uppercase tracking-wide text-muted mb-0.5">{label}</div>
            <div className="text-[14px] font-semibold text-ink">{value}</div>
          </div>
        ))}
      </div>
    </Part>
  );
}
