import * as React from "react"

const Aside = () => {
    return (
        <>
            <h1>RJ's Development Blog</h1>
            <sub>
                <p>My name is Arjan and I am an engineer that turned software developer.</p>
                <p>I always like to learn and experiment and to experience new ways of doing the exactly same things.</p>
                <p>This blog is a place for me to write down my thoughts and experiences and hopefully start a discussion in order to learn from each other.</p>
            </sub>
            <hr />
        </>
    )
}

const DefaultLayout = ({ aside, children }) => {
    aside = aside || <Aside />

    return (
        <div className="layout default">
            <aside>{ aside }</aside>
            <main>{ children }</main>
        </div>
    )
}

export default DefaultLayout