import * as React from "react"
import {Helmet} from "react-helmet";
import {graphql, useStaticQuery} from "gatsby";
import { ThemeToggler } from 'gatsby-plugin-dark-mode'

const DefaultLayout = ({ title, children }) => {
    const commit = useStaticQuery(graphql`
    query {
        gitCommit(latest: {eq: true}) {
            date
            hash
        }
    }
    `)

    return (
        <>
            <Helmet>
                <title>{title ? title : "avwie's programming blog"}</title>
            </Helmet>
            <nav>
                <div className="container">
                    <a href="/">@avwie's programming blog</a>
                    <div className="social">
                        <a title="Github" href="https://github.com/avwie" target="_blank"
                            rel="noreferrer">
                            <img alt="Github" width="24" height="24" src="/layout/github-48.png"/>
                        </a>
                        <a title="Mail" href="mailto:info@avwie.nl" target="_blank" rel="noreferrer">
                            <img alt="Mail" width="24" height="24" src="/layout/mail-48.png"/>
                        </a>
                        <a title="Twitter" href="https://twitter.com/avwie" target="_blank"
                            rel="noreferrer">
                            <img alt="Twitter" width="24" height="24" src="/layout/twitter-48.png"/>
                        </a>
                        <ThemeToggler>
                        {({ theme, toggleTheme }) => (
                            <a className="dark-mode" onClick={e => toggleTheme(theme === "light" ? 'dark' : 'light')}>
                                <img alt={ theme === "dark" ? "light mode" : "dark-mode"} width="24" height="24" src={ theme === "dark" ? "/layout/light-mode-48.png" : "/layout/dark-mode-48.png"}/>
                            </a>
                        )}
                        </ThemeToggler>
                    </div>
                </div>
            </nav>
            <main className="container">
                {children}
            </main>
            <footer className="container">
                <p>Build { commit.gitCommit.hash.substr(0, 7) } - { commit.gitCommit.date }</p>
            </footer>
        </>
    )
}

export default DefaultLayout