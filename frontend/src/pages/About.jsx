import { motion } from 'framer-motion';
import './About.css'; // create a CSS file similar to Home.css / Projects.css

export default function About() {
    return (
        <motion.div
            className="about-container"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
        >
            <section className="introduction">
                <h1 className="title">About Me</h1>
                <p className="subtitle">Who I am & what I do</p>
                <p className="description">
                    I’m Diego Zamarron — a determined high school senior, musician, and programmer. I’m proud of my work in both music and coding, building real web and AI projects while exploring creative solutions. I play viola, piano, and organ, and sing bass in choir, focusing on recording and performance that connects with listeners. Outside of music and coding, I enjoy biking and taking in the fresh air.
                </p>
            </section>
        </motion.div>
    );
}