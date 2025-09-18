
import React, { useState, useMemo } from 'react';
import Header from './components/Header';
import Banner from './components/Banner';
import ProfileGrid from './components/ProfileGrid';
import MessageModal from './components/MessageModal';
import Footer from './components/Footer';
import AdScripts from './components/AdScripts';
import type { PartnerProfile } from './types';
import { images, femaleNames } from './constants';

const App: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedPartner, setSelectedPartner] = useState<PartnerProfile | null>(null);

    const profiles = useMemo<PartnerProfile[]>(() => {
        return images.map((src, idx) => ({
            name: femaleNames[idx % femaleNames.length],
            imageUrl: src.endsWith('.png') || src.endsWith('.jpg') || src.endsWith('.jpeg') ? src : `${src}.png`,
        }));
    }, []);

    const handleOpenModal = (partner: PartnerProfile) => {
        setSelectedPartner(partner);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        // Delay clearing partner to allow for modal fade out animation
        setTimeout(() => setSelectedPartner(null), 300);
    };

    return (
        <div className="bg-gradient-to-b from-slate-900 to-[#020617] text-slate-50 min-h-screen pb-28">
            <div className="max-w-5xl mx-auto p-5">
                <Header />
                <Banner />
                <ProfileGrid profiles={profiles} onSendMessage={handleOpenModal} />
            </div>
            <Footer />
            {selectedPartner && (
                <MessageModal
                    isOpen={isModalOpen}
                    partner={selectedPartner}
                    onClose={handleCloseModal}
                />
            )}
            <AdScripts />
        </div>
    );
};

export default App;
