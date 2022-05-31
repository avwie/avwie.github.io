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
            <nav className="navbar navbar-dark bg-dark">
                <div className="container-lg d-flex">
                    <span className="navbar-brand mt-2 mb-2 h1"><a className="text-decoration-none text-white" href="/">@avwie's programming blog</a></span>
                    <div className="text-light mx-3">
                        <a className="px-2" title="Github" href="https://github.com/avwie" target="_blank"
                           rel="noreferrer">
                            <img alt="Github" width="24" height="24" src="/layout/github-48.png"/>
                        </a>
                        <a className="px-2" title="Mail" href="mailto:info@avwie.nl" target="_blank" rel="noreferrer">
                            <img alt="Mail" width="24" height="24" src="/layout/mail-48.png"/>
                        </a>
                        <a className="px-2" title="Twitter" href="https://twitter.com/avwie" target="_blank"
                           rel="noreferrer">
                            <img alt="Twitter" width="24" height="24" src="/layout/twitter-48.png"/>
                        </a>
                        <ThemeToggler>
                        {({ theme, toggleTheme }) => (
                            <span className="px-2" onClick={e => toggleTheme(theme === "light" ? 'dark' : 'light')}>
                             <img alt={ theme === "dark" ? "light mode" : "dark-mode"} width="24" height="24" src={ theme === "dark" ? "/layout/light-mode-48.png" : "/layout/dark-mode-48.png"}/>
                            </span>
                        )}
                        </ThemeToggler>
                    </div>
                </div>
            </nav>
            <div className="container-lg mt-4">
                {children}
            </div>
            <div className="border-top border-light py-2">
                <div className="container-lg text-muted fw-light text-center" style={{fontSize: "0.8em"}}>
                    <small>Build { commit.gitCommit.hash.substr(0, 7) } - { commit.gitCommit.date }</small>
                </div>
            </div>
        </>
    )
}

export default DefaultLayout