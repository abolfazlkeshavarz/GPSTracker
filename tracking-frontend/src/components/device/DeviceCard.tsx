import { Link } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";

interface Props {
  serial: string;
}

export default function DeviceCard({ serial }: Props) {
  const { t, isRTL } = useLanguage();

  return (
    <Link to={`/device/${serial}`}>
      <div className="bg-white rounded-2xl shadow p-5 hover:shadow-xl transition">
        <h2 className={`text-2xl font-bold ${isRTL ? 'text-right' : ''}`}>
          {serial}
        </h2>
        <p className={`text-gray-500 mt-2 ${isRTL ? 'text-right' : ''}`}>
          {t('gps.tracker.device')}
        </p>
      </div>
    </Link>
  );
}