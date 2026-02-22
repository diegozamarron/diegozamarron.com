import './Home.css'
import { FiGithub } from 'react-icons/fi';
import { FiYoutube } from 'react-icons/fi';
import { motion } from 'framer-motion';

export default function Home(){
    return(
        <motion.div
            initial={{ opacity: 0, y: 20 }}   // start slightly lower & invisible
            animate={{ opacity: 1, y: 0 }}    // fade in and move up
            exit={{ opacity: 0, y: -20 }}     // fade out and move slightly up
            transition={{ duration: 0.35, ease: 'easeOut' }}
        >
            <section className="introduction">
                <h1 className="title">Diego Zamarron</h1>
                <p className="subtitle">High school senior, programmer, musician</p>
                <p className="description">I truly enjoy the intricacies in life... 
                    maybe that's why I became a musician and a coder.
                </p>
            </section>
            <div className='buttons'>
                <a href="https://github.com/diegozamarron"
                    target='_blank'
                    rel='noopener noreferrer'
                    className='github-button'
                >
                    <FiGithub size={20} /> 
                    GitHub
                </a>

                <a href="https://www.youtube.com/@diego_zamarron"
                    target='_blank'
                    rel='noopener noreferrer'
                    className='github-button'
                >
                    <FiYoutube size={20} /> 
                    Youtube
                </a>


            </div>
        </motion.div>
    )
}