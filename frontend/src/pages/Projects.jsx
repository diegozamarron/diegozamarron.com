import Card from '../components/Card';
import './Projects.css'
import { motion } from 'framer-motion';
import { FiMusic } from 'react-icons/fi';
import MapsTrail from '../assets/MapsTrail.png';
import CriptoLag from '../assets/CriptoLag.png';
import EnsembleRecordings from '../assets/EnsembleRecordings.jpg';
import SoloRecordings from '../assets/SoloRecordings.jpg';
import ArrangementsTranscriptions from '../assets/ArrangementsTranscriptions.jpg';


export default function Projects(){
    const codingProjects = [
        {
            title: 'CriptoLag Website',
            description: 'Full-stack Web3 app integrating Solana wallets and Jupiter Swap on the frontend, with a Node.js Express backend proxying QuickNode RPC calls and GeckoTerminal token metrics.',
            link: 'https://github.com/diegozamarron/CriptoLagWebsite',
            image: CriptoLag

        },
        {
            title: 'MapsTrail',
            description: 'Python-based adventure game that uses real-world distance and AI narration to simulate an Oregon Trail–style journey.',
            link: 'https://github.com/diegozamarron/MapsTrail',
            image: MapsTrail

        },
    ];

    const musicProjects = [
        {
            title: 'Ensemble Recordings',
            description: 'Collaborative recordings featuring ensemble performance.',
            link: 'https://youtube.com/playlist?list=PLCTFpY6ULZTOJ0w3OOqlUe1UgIV684FDx&si=10QMPfEP7GFCyW03',
            image: EnsembleRecordings

        },
        {
            title: 'Solo Recordings',
            description: 'Recordings featuring solo performance.',
            link: 'https://www.youtube.com/playlist?list=PLCTFpY6ULZTMpEThdbCLobgGXToFDpqLm',
            image: SoloRecordings

        },

        {
            title: 'Arrangements & Transcriptions',
            description: 'Original arrangements and transcriptions by me.',
            link: 'https://www.youtube.com/playlist?list=PLCTFpY6ULZTMwXaBBTcEOdAikTMWht47Q',
            image: ArrangementsTranscriptions

        },
    ];

    return(
        <motion.div
            initial={{ opacity: 0, y: 20 }}   // start slightly lower & invisible
            animate={{ opacity: 1, y: 0 }}    // fade in and move up
            exit={{ opacity: 0, y: -20 }}     // fade out and move slightly up
            transition={{ duration: 0.35, ease: 'easeOut' }}
        >
            <section className="introduction">
                <h1 className="title">Projects</h1>
                <p className="subtitle">Things I've built</p>
            </section>

            <section className="projects">

                <div className="coding-projects">
                    <h2 className="subtitle">Coding Projects  &lt;/&gt; </h2>
                    {codingProjects.map((project, index) => (
                        <Card
                        key={index}
                        title={project.title}
                        description={project.description}
                        link={project.link}
                        image={project.image}
                        />
                    ))}

                </div>

                <div className="music-projects">
                    <h2 className="subtitle">Music Projects <FiMusic size={25} /></h2>
                    {musicProjects.map((project, index) => (
                        <Card
                        key={index}
                        title={project.title}
                        description={project.description}
                        link={project.link}
                        image={project.image}
                        />
                    ))}
                </div>

            </section>
        </motion.div>
    )
}